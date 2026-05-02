/**
 * useChunkedUpload.ts
 * ───────────────────
 * Custom hook that manages the full chunked + parallel Azure Block Blob upload.
 *
 * Architecture:
 *  1. Request SAS token from backend (GET /api/files/get-upload-url)
 *  2. Split file into chunks (default 8 MB)
 *  3. Upload chunks in parallel (5 concurrent)
 *     Each chunk → PUT <blobUrl>/<blobName>?comp=block&blockid=<id>&<sasToken>
 *  4. Commit block list → PUT <blobUrl>/<blobName>?comp=blocklist&<sasToken>
 *  5. Confirm upload to backend (POST /api/files/confirm-upload)
 *
 * Resume support:
 *  Tracks which blockIds have been successfully uploaded so that
 *  on network error the caller can retry and skips already-done chunks.
 */

import { useState, useRef, useCallback } from "react";

const API_BASE   = "http://localhost:5000/api";
const CHUNK_SIZE = 8 * 1024 * 1024;    // 8 MB per chunk
const CONCURRENCY = 5;                  // parallel uploads

export type UploadPhase =
  | "idle"
  | "requesting"
  | "uploading"
  | "committing"
  | "confirming"
  | "done"
  | "error";

export interface UploadState {
  phase:       UploadPhase;
  progress:    number;        // 0–100
  chunksTotal: number;
  chunksDone:  number;
  errorMsg:    string;
  cloudUrl:    string;
  ipfsCid:     string;
  ipfsUrl:     string;
  fileId:      string;        // MongoDB _id for polling IPFS status
}

const INITIAL: UploadState = {
  phase: "idle", progress: 0, chunksTotal: 0, chunksDone: 0,
  errorMsg: "", cloudUrl: "", ipfsCid: "", ipfsUrl: "", fileId: "",
};

/** Pad a number into a base64-encoded, zero-padded blockId (Azure requirement) */
const toBlockId = (index: number): string => {
  const padded = String(index).padStart(6, "0");
  return btoa(padded); // base64-encode
};

/** Upload a single block to Azure */
const uploadBlock = async (
  blobUrl: string,
  sasToken: string,
  blockId: string,
  chunk: Blob
): Promise<void> => {
  const url = `${blobUrl}?comp=block&blockid=${encodeURIComponent(blockId)}&${sasToken}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type":   "application/octet-stream",
      "Content-Length": String(chunk.size),
      "x-ms-blob-type": "BlockBlob",
    },
    body: chunk,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Block upload failed (${response.status}): ${text}`);
  }
};

/** Commit all blocks to Azure — finalizes the blob */
const commitBlockList = async (
  blobUrl: string,
  sasToken: string,
  blockIds: string[],
  mimeType: string
): Promise<void> => {
  const xmlBody = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<BlockList>",
    ...blockIds.map(id => `  <Latest>${id}</Latest>`),
    "</BlockList>",
  ].join("\n");

  const url = `${blobUrl}?comp=blocklist&${sasToken}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type":       "text/plain; charset=UTF-8",
      "x-ms-blob-content-type": mimeType,
    },
    body: xmlBody,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Block list commit failed (${response.status}): ${text}`);
  }
};

/** Run an array of async tasks with limited concurrency */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress: () => void
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  const worker = async (): Promise<void> => {
    while (index < tasks.length) {
      const taskIndex = index++;
      results[taskIndex] = await tasks[taskIndex]();
      onProgress();
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

/* ─────────────────────────────────────────────────────────────── */

export const useChunkedUpload = () => {
  const [state, setState] = useState<UploadState>(INITIAL);
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    abortRef.current = false;
    setState(INITIAL);
  }, []);

  const upload = useCallback(async (
    file: File,
    description: string = "",
    token: string
  ) => {
    abortRef.current = false;
    setState({ ...INITIAL, phase: "requesting" });

    try {
      // ── 1. Get SAS token from backend ──────────────────────────
      const sasRes = await fetch(
        `${API_BASE}/files/get-upload-url?filename=${encodeURIComponent(file.name)}&filesize=${file.size}&filetype=${encodeURIComponent(file.type)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sasData = await sasRes.json();
      if (!sasRes.ok) throw new Error(sasData.message || "Failed to get upload URL");

      const { blobUrl, sasToken, blobName } = sasData;

      // ── 2. Split file into chunks ───────────────────────────────
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const blockIds: string[] = [];

      setState(s => ({
        ...s,
        phase: "uploading",
        chunksTotal: totalChunks,
        chunksDone: 0,
        progress: 0,
      }));

      // ── 3. Build chunk upload tasks ─────────────────────────────
      const tasks = Array.from({ length: totalChunks }, (_, i) => {
        const blockId = toBlockId(i);
        blockIds.push(blockId);

        return async () => {
          if (abortRef.current) throw new Error("Upload cancelled");
          const start = i * CHUNK_SIZE;
          const end   = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          await uploadBlock(blobUrl, sasToken, blockId, chunk);
        };
      });

      // ── 4. Upload chunks in parallel ────────────────────────────
      let done = 0;
      await runWithConcurrency(tasks, CONCURRENCY, () => {
        done++;
        setState(s => ({
          ...s,
          chunksDone: done,
          progress: Math.round((done / totalChunks) * 90), // 0–90%
        }));
      });

      if (abortRef.current) throw new Error("Upload cancelled");

      // ── 5. Commit block list → finalise blob ────────────────────
      setState(s => ({ ...s, phase: "committing", progress: 92 }));
      await commitBlockList(blobUrl, sasToken, blockIds, file.type || "application/octet-stream");

      // ── 6. Confirm with backend (triggers IPFS backup) ──────────
      setState(s => ({ ...s, phase: "confirming", progress: 96 }));
      const confirmRes = await fetch(`${API_BASE}/files/confirm-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({
          blobName,
          originalName: file.name,
          sizeBytes:    file.size,
          mimeType:     file.type || "application/octet-stream",
          description,
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.message || "Failed to confirm upload");

      setState({
        phase:       "done",
        progress:    100,
        chunksTotal: totalChunks,
        chunksDone:  totalChunks,
        errorMsg:    "",
        cloudUrl:    confirmData.file.cloudUrl,
        ipfsCid:     confirmData.file.ipfsCid || "",
        ipfsUrl:     confirmData.file.ipfsUrl  || "",
        fileId:      confirmData.file.id,
      });

    } catch (err: any) {
      if (!abortRef.current) {
        setState(s => ({ ...s, phase: "error", errorMsg: err.message }));
      } else {
        setState(INITIAL);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    setState(INITIAL);
  }, []);

  return { state, upload, cancel, reset };
};
