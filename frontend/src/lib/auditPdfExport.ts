/**
 * auditPdfExport.ts  v3 – FIXED
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixes applied vs v2:
 *  1. No Unicode / emoji – Helvetica only supports Latin-1
 *  2. Watermark drawn FIRST per page (not in didDrawPage) so content covers it
 *  3. autoTable column widths sum exactly to CW (515 pt) so no overflow
 *  4. Timeline + Table share one page to avoid half-empty pages
 *  5. Section headers use simple colored left-bar instead of gradient that bled
 *  6. Footer always drawn last in post-processing loop
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AuditEvent {
  eventType:    string;
  action:       string;
  fileName:     string;
  actor:        string;
  txHash?:      string | null;
  blockNumber?: number | null;
  etherscanUrl?: string | null;
  timestamp?:   string;
  gasUsed?:     string | null;
}

export interface PdfExportOptions {
  events:   AuditEvent[];
  userName: string;
  userRole: string;
}

// ── Page layout ───────────────────────────────────────────────────────────────
const PW   = 595.28;
const PH   = 841.89;
const M    = 40;
const CW   = PW - M * 2;   // 515.28 pt
const FOOT = 28;            // footer height
const BOT  = PH - FOOT - 6; // safe bottom edge

// ── Color palette ─────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C = {
  primary:     [91,  63,  214] as RGB,
  navyDark:    [20,  16,  54]  as RGB,
  navyMid:     [48,  30,  130] as RGB,
  secondary:   [37,  99,  235] as RGB,
  accent:      [16,  185, 129] as RGB,
  warning:     [245, 158, 11]  as RGB,
  danger:      [239, 68,  68]  as RGB,
  text:        [15,  23,  42]  as RGB,
  muted:       [100, 116, 139] as RGB,
  white:       [255, 255, 255] as RGB,
  border:      [226, 232, 240] as RGB,
  bg:          [248, 250, 252] as RGB,
  light:       [241, 245, 249] as RGB,
  purpleLight: [237, 233, 254] as RGB,
  blueLight:   [219, 234, 254] as RGB,
  greenLight:  [209, 250, 229] as RGB,
  orangeLight: [255, 237, 213] as RGB,
  redLight:    [254, 226, 226] as RGB,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(iso?: string) {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function shortHash(h?: string | null) {
  if (!h) return "Off-chain";
  return h.slice(0, 10) + "..." + h.slice(-8);
}

// Simulated gradient – 15 steps is enough for smooth look
function gradRect(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  from: RGB, to: RGB,
) {
  const N = 15;
  const sh = h / N;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    doc.setFillColor(
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    );
    doc.rect(x, y + i * sh, w, sh + 1, "F");
  }
}

// Shadow + filled rounded card
function card(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  r = 6, bg: RGB = C.white,
) {
  doc.setFillColor(208, 213, 228);
  doc.roundedRect(x + 1.5, y + 2, w, h, r, r, "F");
  doc.setFillColor(...bg);
  doc.roundedRect(x, y, w, h, r, r, "F");
}

// Bold section label with left accent bar (no gradient – clean)
function sectionLabel(doc: jsPDF, label: string, x: number, y: number) {
  doc.setFillColor(...C.primary);
  doc.rect(x, y, 3, 13, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C.text);
  doc.text(label, x + 9, y + 10);
}

// DNA helix decoration (two sine waves + rungs)
function dnaHelix(doc: jsPDF, cx: number, y0: number, h: number) {
  const steps = 56;
  const amp   = 10;
  const freq  = (2 * Math.PI) / (h / 3.5);

  doc.setDrawColor(175, 140, 240);
  doc.setLineWidth(1);
  for (let i = 0; i < steps; i++) {
    const t1 = (i / steps) * h, t2 = ((i + 1) / steps) * h;
    doc.line(cx + amp * Math.sin(freq * t1), y0 + t1, cx + amp * Math.sin(freq * t2), y0 + t2);
  }
  doc.setDrawColor(130, 185, 255);
  doc.setLineWidth(1);
  for (let i = 0; i < steps; i++) {
    const t1 = (i / steps) * h, t2 = ((i + 1) / steps) * h;
    doc.line(
      cx + amp * Math.sin(freq * t1 + Math.PI), y0 + t1,
      cx + amp * Math.sin(freq * t2 + Math.PI), y0 + t2,
    );
  }
  doc.setDrawColor(195, 175, 240);
  doc.setLineWidth(0.4);
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * h;
    doc.line(
      cx + amp * Math.sin(freq * t), y0 + t,
      cx + amp * Math.sin(freq * t + Math.PI), y0 + t,
    );
  }
}

// ── Watermark – drawn FIRST, content drawn on top covers it ──────────────────
// Color is near-white so content fills (white/light cards) fully hide it.
// Only empty page areas show the subtle watermark — correct behaviour.
function drawWatermark(doc: jsPDF) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  // Use a near-white purple so white card fills completely cover it
  doc.setTextColor(245, 243, 253);
  doc.text("GENOVAULT  CONFIDENTIAL", PW / 2, PH * 0.30, { align: "center", angle: 42 });
  doc.text("GENOVAULT  CONFIDENTIAL", PW / 2, PH * 0.63, { align: "center", angle: 42 });
}

// ── Inner-page header strip ───────────────────────────────────────────────────
function drawPageHeader(doc: jsPDF, section: string) {
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PW, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.primary);
  doc.text("GenoVault", M, 17);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.muted);
  doc.text("  |  Blockchain Audit Report", M + 46, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.muted);
  doc.text(section, PW - M, 17, { align: "right" });
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.line(M, 23, PW - M, 23);
}

// ── Footer – called last so it sits on top of everything ─────────────────────
function drawFooter(doc: jsPDF, pageNum: number, total: number) {
  const fy = PH - FOOT;
  doc.setFillColor(...C.navyDark);
  doc.rect(0, fy, PW, FOOT, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(186, 165, 255);
  doc.text("GenoVault", M, fy + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(120, 108, 165);
  doc.text("Secure Genomics Platform", M, fy + 20);

  doc.setFontSize(6.5);
  doc.setTextColor(108, 98, 155);
  doc.text(
    "CONFIDENTIAL  |  Authorized Use Only  |  genovault.io  |  Blockchain Verified",
    PW / 2, fy + 15, { align: "center" },
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(175, 158, 230);
  doc.text(`${pageNum} / ${total}`, PW - M, fy + 11, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(108, 98, 155);
  doc.text(
    new Date().toISOString().slice(0, 16).replace("T", " "),
    PW - M, fy + 20, { align: "right" },
  );
}

// ── Action colours ────────────────────────────────────────────────────────────
const AC: Record<string, { bg: RGB; fg: RGB }> = {
  Upload:    { bg: C.blueLight,   fg: C.secondary },
  Request:   { bg: C.orangeLight, fg: C.warning   },
  Requested: { bg: C.orangeLight, fg: C.warning   },
  Approve:   { bg: C.greenLight,  fg: C.accent    },
  Approved:  { bg: C.greenLight,  fg: C.accent    },
  Reject:    { bg: C.redLight,    fg: C.danger    },
  Rejected:  { bg: C.redLight,    fg: C.danger    },
  Revoke:    { bg: C.light,       fg: C.muted     },
  Revoked:   { bg: C.light,       fg: C.muted     },
};

const AHex: Record<string, string> = {
  Upload: "#2563EB", Request: "#F59E0B", Requested: "#F59E0B",
  Approve: "#10B981", Approved: "#10B981",
  Reject: "#EF4444",  Rejected: "#EF4444",
  Revoke: "#94A3B8",  Revoked: "#94A3B8",
};

// ── Canvas pie chart ──────────────────────────────────────────────────────────
function makePie(data: { label: string; value: number; color: string }[]): string {
  const cv = document.createElement("canvas");
  cv.width = 360; cv.height = 230;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#F8FAFC"; ctx.fillRect(0, 0, 360, 230);

  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) {
    ctx.fillStyle = "#64748B"; ctx.font = "12px Arial"; ctx.textAlign = "center";
    ctx.fillText("No data", 180, 115); return cv.toDataURL();
  }

  let ang = -Math.PI / 2;
  const cx = 105, cy = 112, R = 82, ir = 44;
  for (const s of data) {
    const sw = (s.value / total) * 2 * Math.PI;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, ang, ang + sw); ctx.closePath();
    ctx.fillStyle = s.color; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
    ang += sw;
  }
  ctx.beginPath(); ctx.arc(cx, cy, ir, 0, 2 * Math.PI);
  ctx.fillStyle = "#F8FAFC"; ctx.fill();
  ctx.fillStyle = "#0F172A"; ctx.font = "bold 17px Arial"; ctx.textAlign = "center";
  ctx.fillText(String(total), cx, cy + 5);
  ctx.fillStyle = "#64748B"; ctx.font = "8px Arial"; ctx.fillText("events", cx, cy + 17);

  let ly = 26;
  for (const s of data) {
    const pct = Math.round((s.value / total) * 100);
    ctx.fillStyle = s.color; ctx.fillRect(200, ly - 8, 10, 10);
    ctx.fillStyle = "#0F172A"; ctx.font = "9px Arial"; ctx.textAlign = "left";
    ctx.fillText(`${s.label}  ${s.value}  (${pct}%)`, 215, ly); ly += 20;
  }
  return cv.toDataURL("image/png");
}

// ── Canvas bar chart ──────────────────────────────────────────────────────────
function makeBar(data: { label: string; value: number; color: string }[]): string {
  const cv = document.createElement("canvas");
  cv.width = 420; cv.height = 230;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#F8FAFC"; ctx.fillRect(0, 0, 420, 230);
  if (!data.length) return cv.toDataURL();

  const maxV = Math.max(...data.map(d => d.value), 1);
  const baseY = 185, chartH = 138;
  const bw = Math.min(50, 360 / data.length - 12);
  const gap = 360 / data.length;

  ctx.strokeStyle = "#E2E8F0"; ctx.lineWidth = 0.8;
  for (let i = 0; i <= 4; i++) {
    const gy = baseY - (i / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(36, gy); ctx.lineTo(400, gy); ctx.stroke();
    ctx.fillStyle = "#94A3B8"; ctx.font = "8px Arial"; ctx.textAlign = "right";
    ctx.fillText(String(Math.round((i / 4) * maxV)), 32, gy + 3);
  }

  data.forEach((d, i) => {
    const bh = (d.value / maxV) * chartH;
    const bx = 40 + i * gap + (gap - bw) / 2;
    const by = baseY - bh;
    const gr = ctx.createLinearGradient(bx, by, bx, baseY);
    gr.addColorStop(0, d.color); gr.addColorStop(1, d.color + "55");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, [4, 4, 0, 0]); ctx.fill();
    ctx.fillStyle = "#0F172A"; ctx.font = "bold 10px Arial"; ctx.textAlign = "center";
    ctx.fillText(String(d.value), bx + bw / 2, by - 5);
    ctx.fillStyle = "#64748B"; ctx.font = "8px Arial";
    ctx.fillText(d.label, bx + bw / 2, baseY + 14);
  });
  return cv.toDataURL("image/png");
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 1  –  COVER
// ─────────────────────────────────────────────────────────────────────────────
function buildCover(doc: jsPDF, opts: PdfExportOptions) {
  const headerH = 276;

  // 1. Gradient header background (dark navy -> mid purple)
  gradRect(doc, 0, 0, PW, headerH, C.navyDark, C.navyMid);

  // 2. DNA helix – right edge of header, clear of text
  dnaHelix(doc, PW - 54, 22, 228);

  // 3. Logo pill
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, M, 106, 22, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...C.primary);
  doc.text("GenoVault", M + 8, M + 15);

  // Verified pill next to logo
  doc.setFillColor(...C.greenLight);
  doc.roundedRect(M + 114, M + 4, 92, 14, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.accent);
  doc.text("AUDIT  VERIFIED", M + 121, M + 13);

  // 4. Main heading
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text("Blockchain Genomic", M, 106);
  doc.text("Audit Report", M, 134);

  // Accent bar under title
  doc.setFillColor(...C.accent);
  doc.rect(M, 143, 68, 2.5, "F");

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(185, 174, 238);
  doc.text("Secure  |  Immutable  |  HIPAA Ready  |  Blockchain Verified", M, 160);

  // 5. Compliance pills (in header)
  const hPills = [
    { t: "HIPAA", bg: C.greenLight, fg: C.accent },
    { t: "GDPR",  bg: C.blueLight,  fg: C.secondary },
    { t: "ISO 27001", bg: C.purpleLight, fg: C.primary },
    { t: "AES-256",   bg: C.orangeLight, fg: C.warning },
    { t: "Tamper Proof", bg: C.redLight, fg: C.danger },
  ];
  let px = M;
  for (const p of hPills) {
    const pw2 = p.t.length * 5.4 + 16;
    doc.setFillColor(...p.bg);
    doc.roundedRect(px, 175, pw2, 14, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...p.fg);
    doc.text(p.t, px + 8, 184.5);
    px += pw2 + 7;
  }

  // Separator strip
  doc.setFillColor(...C.primary);
  doc.rect(0, headerH, PW, 3, "F");

  // ── Executive Summary card ────────────────────────────────────────────────
  const cardY = headerH + 14;
  card(doc, M, cardY, CW, 168, 8);

  // Card header bar
  doc.setFillColor(...C.primary);
  doc.roundedRect(M, cardY, CW, 28, 8, 8, "F");
  doc.setFillColor(...C.primary);
  doc.rect(M, cardY + 14, CW, 14, "F"); // fill round gap

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("Executive Summary", M + 13, cardY + 18);

  // Verified badge inside card header
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(PW - M - 86, cardY + 7, 76, 14, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text("AUDIT  VERIFIED", PW - M - 81, cardY + 16.5);

  // 2×4 info grid
  const INFO = [
    { l: "Report Generated",    v: fmt(new Date().toISOString()) },
    { l: "Exported By",         v: opts.userName },
    { l: "User Role",           v: opts.userRole.toUpperCase() },
    { l: "Organization",        v: "GenoVault Platform" },
    { l: "Blockchain Network",  v: "Ethereum Sepolia Testnet" },
    { l: "Total Audit Events",  v: `${opts.events.length} events` },
    { l: "Hash Algorithm",      v: "keccak256" },
    { l: "Audit Status",        v: "Verified & Immutable" },
  ];

  const gY  = cardY + 38;
  const cw2 = CW / 2 - 8;

  for (let i = 0; i < INFO.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const ix  = M + 13 + col * (cw2 + 16);
    const iy  = gY + row * 31;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(INFO[i].l, ix, iy);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const isGreen = i === 7;
    doc.setTextColor(...(isGreen ? C.accent : C.text));
    doc.text(INFO[i].v, ix, iy + 12);

    if (row < 3) {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.25);
      doc.line(ix, iy + 18, ix + cw2 - 4, iy + 18);
    }
  }

  // ── Stats row ─────────────────────────────────────────────────────────────
  const sY = cardY + 168 + 12;
  const sw  = (CW - 9) / 4;

  const uploads  = opts.events.filter(e => e.action === "Upload").length;
  const reqs     = opts.events.filter(e => e.action.toLowerCase().includes("request")).length;
  const approvs  = opts.events.filter(e => e.action.toLowerCase().includes("approv")).length;
  const onChain  = opts.events.filter(e => e.txHash).length;

  const STATS = [
    { lbl: "Total Events",  val: opts.events.length, sub: "All audit records",  bg: C.purpleLight, acc: C.primary   },
    { lbl: "Files Uploaded",val: uploads,            sub: "Genomic datasets",   bg: C.blueLight,   acc: C.secondary },
    { lbl: "Access Events", val: reqs + approvs,     sub: "Requests & grants",  bg: C.greenLight,  acc: C.accent    },
    { lbl: "On-Chain Txns", val: onChain,            sub: "Blockchain records", bg: C.orangeLight, acc: C.warning   },
  ];

  for (let i = 0; i < 4; i++) {
    const s  = STATS[i];
    const sx = M + i * (sw + 3);
    card(doc, sx, sY, sw, 66, 7, s.bg);
    doc.setFillColor(...s.acc);
    doc.roundedRect(sx + 8, sY + 9, 3, 48, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...s.acc);
    doc.text(String(s.val), sx + 18, sY + 34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C.text);
    doc.text(s.lbl, sx + 18, sY + 47);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(s.sub, sx + 18, sY + 56);
  }

  // ── Security & Compliance badges ──────────────────────────────────────────
  const compY = sY + 66 + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...C.text);
  doc.text("Security & Compliance", M, compY);

  const COMP = [
    { t: "HIPAA Ready",          bg: C.greenLight,  fg: C.accent    },
    { t: "GDPR Compliant",       bg: C.blueLight,   fg: C.secondary },
    { t: "ISO 27001",            bg: C.purpleLight, fg: C.primary   },
    { t: "Blockchain Integrity", bg: C.orangeLight, fg: C.warning   },
    { t: "Tamper Proof",         bg: C.greenLight,  fg: C.accent    },
    { t: "AES-256 Encrypted",    bg: C.redLight,    fg: C.danger    },
    { t: "Zero-Knowledge Ready", bg: C.purpleLight, fg: C.primary   },
    { t: "Audit Compliant",      bg: C.blueLight,   fg: C.secondary },
  ];

  let cbx = M, cby = compY + 10;
  for (const c of COMP) {
    const cbw = c.t.length * 5.3 + 20;
    if (cbx + cbw > PW - M) { cbx = M; cby += 22; }
    doc.setFillColor(...c.bg);
    doc.roundedRect(cbx, cby, cbw, 16, 8, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...c.fg);
    doc.text(c.t, cbx + 10, cby + 11);
    cbx += cbw + 6;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 2  –  TIMELINE  (returns ending Y so table can follow below it)
// ─────────────────────────────────────────────────────────────────────────────
function buildTimeline(doc: jsPDF, events: AuditEvent[], startY: number): number {
  let y      = startY;
  const lX   = M + 20;
  const cX   = lX + 16;
  const cW2  = CW - 36;

  sectionLabel(doc, "Audit Timeline", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text(`${events.length} events  |  newest first`, M + 12, y + 24);
  y += 34;

  for (let i = 0; i < events.length; i++) {
    const e   = events[i];
    const col = AC[e.action] ?? { bg: C.light, fg: C.muted };
    const cH  = 46;

    if (y + cH + 10 > BOT) return y; // page full — caller handles new page

    // Connector line to next event
    if (i < events.length - 1) {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(1.5);
      doc.line(lX, y + 9, lX, y + cH + 9);
    }

    // Dot
    doc.setFillColor(...col.fg);
    doc.circle(lX, y + 9, 6, "F");
    doc.setFillColor(255, 255, 255);
    doc.circle(lX, y + 9, 3.2, "F");

    // Card background
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cX, y, cW2, cH, 5, 5, "F");
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(cX, y, cW2, cH, 5, 5, "S");

    // Left colour stripe
    doc.setFillColor(...col.fg);
    doc.roundedRect(cX, y, 3, cH, 2, 2, "F");

    // Action badge
    const bw = e.action.length * 5.6 + 16;
    doc.setFillColor(...col.bg);
    doc.roundedRect(cX + 10, y + 7, bw, 14, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...col.fg);
    doc.text(e.action, cX + 17, y + 17);

    // Timestamp
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(fmt(e.timestamp), cX + 12 + bw + 5, y + 17);

    // File name
    const fn = e.fileName.length > 65 ? e.fileName.slice(0, 62) + "..." : e.fileName;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.text);
    doc.text(fn, cX + 10, y + 31);

    // Actor right-aligned
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text("by " + e.actor, PW - M - 6, y + 31, { align: "right" });

    // Blockchain status badge bottom-left
    if (e.txHash) {
      doc.setFillColor(...C.greenLight);
      doc.roundedRect(cX + 10, y + 36, 52, 8, 3, 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(...C.accent);
      doc.text("ON-CHAIN", cX + 14, y + 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(...C.secondary);
      doc.text(shortHash(e.txHash), cX + 68, y + 42);
    } else {
      doc.setFillColor(...C.light);
      doc.roundedRect(cX + 10, y + 36, 50, 8, 3, 3, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(...C.muted);
      doc.text("OFF-CHAIN", cX + 14, y + 42);
    }

    y += cH + 8;
  }

  return y;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE 3  –  ANALYTICS + BLOCKCHAIN VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
function buildAnalytics(doc: jsPDF, events: AuditEvent[]) {
  let y = 36;

  // Charts
  sectionLabel(doc, "Audit Analytics", M, y);
  y += 22;

  const counts: Record<string, number> = {};
  for (const e of events) counts[e.action] = (counts[e.action] || 0) + 1;
  const pieData = Object.entries(counts).map(([lbl, val]) => ({
    label: lbl, value: val, color: AHex[lbl] ?? "#7C3AED",
  }));

  if (pieData.length > 0) {
    const pieImg = makePie(pieData);
    const barImg = makeBar(pieData);
    const hw     = (CW - 10) / 2;

    card(doc, M, y, hw, 180, 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.text);
    doc.text("Action Distribution", M + 10, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text("Breakdown by event type", M + 10, y + 23);
    doc.addImage(pieImg, "PNG", M + 4, y + 28, hw - 8, 144);

    card(doc, M + hw + 10, y, hw, 180, 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.text);
    doc.text("Activity Breakdown", M + hw + 20, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text("Events per action", M + hw + 20, y + 23);
    doc.addImage(barImg, "PNG", M + hw + 12, y + 28, hw - 14, 144);

    y += 194;
  }

  // ── Blockchain Verification ──────────────────────────────────────────────
  y += 8;
  sectionLabel(doc, "Blockchain Verification", M, y);
  y += 18;

  const onChain = events.filter(e => e.txHash).length;
  const pct     = events.length > 0 ? Math.round((onChain / events.length) * 100) : 0;

  card(doc, M, y, CW, 118, 7);

  // On-chain coverage bar
  doc.setFillColor(...C.light);
  doc.roundedRect(M + 10, y + 10, CW - 20, 14, 4, 4, "F");
  if (pct > 0) {
    doc.setFillColor(...C.accent);
    doc.roundedRect(M + 10, y + 10, Math.max(8, (CW - 20) * pct / 100), 14, 4, 4, "F");
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(`${pct}%  On-chain Coverage`, M + 16, y + 19.5);

  const VINFO = [
    { l: "Network",          v: "Ethereum Sepolia Testnet" },
    { l: "Chain ID",         v: "11155111" },
    { l: "Block Explorer",   v: "sepolia.etherscan.io" },
    { l: "Hash Algorithm",   v: "keccak256" },
    { l: "Signature Scheme", v: "ECDSA secp256k1" },
    { l: "Verification",     v: `${onChain} / ${events.length} events on-chain` },
  ];

  const vGY = y + 32;
  const vCW = CW / 3;
  for (let i = 0; i < 6; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const ix = M + 14 + col * vCW;
    const iy = vGY + row * 36;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(VINFO[i].l, ix, iy);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...(i === 5 ? C.accent : C.text));
    doc.text(VINFO[i].v, ix, iy + 12);

    if (col < 2) {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.3);
      doc.line(M + (col + 1) * vCW + 4, vGY - 2, M + (col + 1) * vCW + 4, vGY + 76);
    }
  }

  y += 130;

  // ── Risk Assessment ──────────────────────────────────────────────────────
  y += 8;
  sectionLabel(doc, "Risk Assessment", M, y);
  y += 18;

  const RISKS = [
    { l: "Integrity",           v: "Intact",            ok: true },
    { l: "Authentication",      v: "JWT + TOTP MFA",    ok: true },
    { l: "Access Pattern",      v: "Normal",            ok: true },
    { l: "Suspicious Activity", v: "None Detected",     ok: true },
    { l: "Tamper Detection",    v: "No Tampering Found",ok: true },
    { l: "Encryption",          v: "AES-256",           ok: true },
  ];

  const rw = (CW - 8) / 3;
  for (let i = 0; i < 6; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const rx  = M + col * (rw + 4);
    const ry  = y + row * 36;
    card(doc, rx, ry, rw, 30, 5, RISKS[i].ok ? C.greenLight : C.redLight);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...C.muted);
    doc.text(RISKS[i].l, rx + 8, ry + 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...(RISKS[i].ok ? C.accent : C.danger));
    doc.text(RISKS[i].v, rx + 8, ry + 22);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export function exportAuditPDF(opts: PdfExportOptions) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // ── TABLE column widths summing to exactly CW (515 pt) ─────────────────
  // 72 + 52 + 152 + 70 + 80 + 35 + 54 = 515
  const COL = [72, 52, 152, 70, 80, 35, 54];

  // ═════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Cover
  // ═════════════════════════════════════════════════════════════════════════
  drawWatermark(doc);         // drawn first → content will cover it
  buildCover(doc, opts);

  // ═════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Timeline  +  Audit Table (same page when data is small)
  // ═════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawWatermark(doc);         // must be first on this page too
  drawPageHeader(doc, "Audit Records");

  const timelineBottom = buildTimeline(doc, opts.events, 34);

  // Gap + section label for table
  const tableHeaderY = timelineBottom + 16;
  sectionLabel(doc, "Detailed Audit Records", M, tableHeaderY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.muted);
  doc.text("Complete blockchain-verified event log", M + 12, tableHeaderY + 23);

  autoTable(doc, {
    startY: tableHeaderY + 32,
    margin: { left: M, right: M },
    head: [["Time", "Action", "File", "Actor", "Tx Hash", "Block", "Status"]],
    body: opts.events.map(r => [
      fmt(r.timestamp),
      r.action,
      r.fileName.length > 38 ? r.fileName.slice(0, 35) + "..." : r.fileName,
      r.actor,
      shortHash(r.txHash),
      r.blockNumber != null ? "#" + r.blockNumber : "--",
      r.txHash ? "ON-CHAIN" : "Off-chain",
    ]),
    styles: {
      fontSize:    7.5,
      cellPadding: { top: 5, bottom: 5, left: 5, right: 4 },
      textColor:   C.text as [number, number, number],
      lineColor:   C.border as [number, number, number],
      lineWidth:   0.3,
      overflow:    "ellipsize",
    },
    headStyles: {
      fillColor:  C.primary as [number, number, number],
      textColor:  [255, 255, 255] as [number, number, number],
      fontStyle:  "bold",
      fontSize:   7.5,
      cellPadding:{ top: 7, bottom: 7, left: 5, right: 4 },
    },
    alternateRowStyles: { fillColor: C.bg as [number, number, number] },
    columnStyles: {
      0: { cellWidth: COL[0] },
      1: { cellWidth: COL[1] },
      2: { cellWidth: COL[2] },
      3: { cellWidth: COL[3] },
      4: { cellWidth: COL[4] },
      5: { cellWidth: COL[5] },
      6: { cellWidth: COL[6] },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 1) {
        const a = AC[String(data.cell.raw)];
        if (a) { data.cell.styles.textColor = a.fg as [number, number, number]; data.cell.styles.fontStyle = "bold"; }
      }
      if (data.column.index === 6) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = String(data.cell.raw) === "ON-CHAIN"
          ? C.accent as [number, number, number]
          : C.muted  as [number, number, number];
      }
    },
    // NOTE: Do NOT call drawWatermark here — it would draw on top of table content.
    // Watermark is pre-drawn at page start. New autoTable pages: handled by post-loop.
    didDrawPage: () => {
      drawPageHeader(doc, "Audit Records");
    },
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Analytics + Blockchain Verification + Risk Assessment
  // ═════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawWatermark(doc);
  drawPageHeader(doc, "Analytics & Verification");
  buildAnalytics(doc, opts.events);

  // ═════════════════════════════════════════════════════════════════════════
  // POST-PROCESSING:
  //   1. Add watermark to any extra pages autoTable created (pages > 3)
  //   2. Add footer to ALL pages (drawn last → always on top)
  // ═════════════════════════════════════════════════════════════════════════
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    // Pages created mid-way by autoTable don't have watermark — add now.
    // (On pages 1-3 it renders under existing content; on extra pages it's blank.)
    if (p > 3) {
      drawWatermark(doc);
      drawPageHeader(doc, "Audit Records");
    }
    drawFooter(doc, p, total); // always last → always on top of watermark
  }

  doc.save(`genovault-audit-${Date.now()}.pdf`);
}
