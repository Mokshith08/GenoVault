/**
 * useChunkedUpload.ts
 * ───────────────────
 * High-performance chunked upload using the official Azure Blob Storage
 * browser SDK (@azure/storage-blob).
 *
 * Flow:
 *   1. GET /api/files/get-upload-url  → SAS URL from backend
 *   2. BlockBlobClient.uploadData()   → direct browser → Azure (no backend bottleneck)
 *   3. POST /api/files/confirm-upload → backend saves metadata, then AES-256 encrypts
 *                                       and IPFS-backs-up in the background
 */

import { useState, useRef, useCallback } from "react";
import { BlockBlobClient } from "@azure/storage-blob";

const API_BASE = "http://localhost:5000/api";

// ── Performance constants ─────────────────────────────────────────────────
const CONCURRENCY      = 16;
const BLOCK_SIZE_SMALL = 4  * 1024 * 1024;   // 4 MB  — files < 256 MB
const BLOCK_SIZE_LARGE = 16 * 1024 * 1024;   // 16 MB — files ≥ 256 MB
const MAX_SINGLE_SHOT  = 256 * 1024 * 1024;  // 256 MB single PUT
const SPLIT_THRESHOLD  = 256 * 1024 * 1024;

const getBlockSize = (fileSize: number) =>
  fileSize >= SPLIT_THRESHOLD ? BLOCK_SIZE_LARGE : BLOCK_SIZE_SMALL;

// ── Types ─────────────────────────────────────────────────────────────────
export type UploadPhase =
  | "idle"
  | "requesting"
  | "uploading"
  | "confirming"
  | "done"
  | "error";

export interface UploadState {
  phase:        UploadPhase;
  progress:     number;
  loadedBytes:  number;
  totalBytes:   number;
  speedMBps:    number;
  errorMsg:     string;
  cloudUrl:     string;
  ipfsCid:      string;
  ipfsUrl:      string;
  fileId:       string;
}

const INITIAL: UploadState = {
  phase: "idle", progress: 0, loadedBytes: 0, totalBytes: 0, speedMBps: 0,
  errorMsg: "", cloudUrl: "", ipfsCid: "", ipfsUrl: "", fileId: "",
};

// ── Hook ──────────────────────────────────────────────────────────────────
export const useChunkedUpload = () => {
  const [state, setState] = useState<UploadState>(INITIAL);
  const abortRef  = useRef(false);
  const abortCtrl = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current = false;
    setState(INITIAL);
  }, []);

  const upload = useCallback(async (
    file:        File,
    description: string,
    token:       string
  ) => {
    abortRef.current  = false;
    abortCtrl.current = new AbortController();
    setState({ ...INITIAL, phase: "requesting", totalBytes: file.size });

    try {
      // ── 1. Get SAS URL from backend ─────────────────────────────
      const sasRes = await fetch(
        `${API_BASE}/files/get-upload-url` +
        `?filename=${encodeURIComponent(file.name)}` +
        `&filesize=${file.size}` +
        `&filetype=${encodeURIComponent(file.type || "application/octet-stream")}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal:  abortCtrl.current.signal,
        }
      );
      const sasData = await sasRes.json();
      if (!sasRes.ok) throw new Error(sasData.message || "Failed to get upload URL");

      const { sasUrl, blobName } = sasData as { sasUrl: string; blobName: string };

      // ── 2. Upload directly to Azure using the official SDK ──────
      setState(s => ({ ...s, phase: "uploading" }));

      const blockSize = getBlockSize(file.size);

      let lastLoaded = 0;
      let lastTime   = Date.now();

      const blockBlobClient = new BlockBlobClient(sasUrl);

      await blockBlobClient.uploadData(file, {
        blockSize,
        concurrency:       CONCURRENCY,
        maxSingleShotSize: MAX_SINGLE_SHOT,
        abortSignal:       abortCtrl.current.signal,

        onProgress: (ev) => {
          if (abortRef.current) return;

          const loaded = ev.loadedBytes;
          const now    = Date.now();
          const dt     = (now - lastTime) / 1000;
          const db     = (loaded - lastLoaded) / 1e6;
          const speed  = dt > 0.3 ? Math.round((db / dt) * 10) / 10 : 0;

          if (speed > 0) { lastLoaded = loaded; lastTime = now; }

          setState(s => ({
            ...s,
            loadedBytes: loaded,
            progress:    Math.min(96, Math.round((loaded / file.size) * 96)),
            speedMBps:   speed > 0 ? speed : s.speedMBps,
          }));
        },

        blobHTTPHeaders: {
          blobContentType: file.type || "application/octet-stream",
        },
      });

      if (abortRef.current) throw new Error("Upload cancelled");

      // ── 3. Confirm with backend → saves metadata + starts encryption + IPFS ─
      setState(s => ({ ...s, phase: "confirming", progress: 97 }));

      const confirmRes = await fetch(`${API_BASE}/files/confirm-upload`, {
        method:  "POST",
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
        signal: abortCtrl.current.signal,
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.message || "Confirm failed");

      setState({
        phase:       "done",
        progress:    100,
        loadedBytes: file.size,
        totalBytes:  file.size,
        speedMBps:   0,
        errorMsg:    "",
        cloudUrl:    confirmData.file.cloudUrl,
        ipfsCid:     confirmData.file.ipfsCid  || "",
        ipfsUrl:     confirmData.file.ipfsUrl   || "",
        fileId:      String(confirmData.file.id),
      });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (abortRef.current || msg.toLowerCase().includes("abort")) {
        setState(INITIAL);
      } else {
        setState(s => ({ ...s, phase: "error", errorMsg: msg }));
      }
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    abortCtrl.current?.abort();
    setState(INITIAL);
  }, []);

  return { state, upload, cancel, reset };
};
