import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search, FileDown, UploadCloud, Inbox, ShieldCheck, KeyRound,
  Ban, FileCheck2, RefreshCw, ExternalLink, Loader2, AlertTriangle,
  XCircle, CheckCircle2,
} from "lucide-react";
import { PageHeader }   from "@/components/dashboard/PageHeader";
import { Card }         from "@/components/ui/card";
import { Input }        from "@/components/ui/input";
import { Button }       from "@/components/ui/button";
import { Badge }        from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth }      from "@/contexts/AuthContext";
import jsPDF            from "jspdf";
import autoTable        from "jspdf-autotable";

interface AuditEvent {
  eventType:   string;
  action:      string;
  fileId?:     number | null;
  fileName:    string;
  actor:       string;
  txHash?:     string | null;
  blockNumber?: number | null;
  etherscanUrl?: string | null;
  timestamp?:  string;
  gasUsed?:    string | null;
}

const actionMeta: Record<string, { icon: React.ElementType; color: string }> = {
  Upload:   { icon: UploadCloud,  color: "bg-blue-500/20 text-blue-400"      },
  Request:  { icon: Inbox,        color: "bg-amber-500/20 text-amber-400"    },
  Approve:  { icon: ShieldCheck,  color: "bg-emerald-500/20 text-emerald-400" },
  Reject:   { icon: XCircle,      color: "bg-red-500/20 text-red-400"        },
  Revoke:   { icon: Ban,          color: "bg-zinc-500/20 text-zinc-400"      },
  Verify:   { icon: FileCheck2,   color: "bg-violet-500/20 text-violet-400"  },
  Access:   { icon: KeyRound,     color: "bg-primary/20 text-primary"        },
  Approved: { icon: CheckCircle2, color: "bg-emerald-500/20 text-emerald-400" },
  Rejected: { icon: XCircle,      color: "bg-red-500/20 text-red-400"        },
  Revoked:  { icon: Ban,          color: "bg-zinc-500/20 text-zinc-400"      },
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function TxBadge({ txHash, etherscanUrl }: { txHash?: string | null; etherscanUrl?: string | null }) {
  if (!txHash) return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      Off-chain
    </span>
  );
  const short = `${txHash.slice(0, 8)}…${txHash.slice(-6)}`;
  if (etherscanUrl) {
    return (
      <a href={etherscanUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors">
        {short}<ExternalLink className="h-3 w-3 flex-shrink-0" />
      </a>
    );
  }
  return <span className="font-mono text-xs text-muted-foreground">{short}</span>;
}

const Audit = () => {
  const { token, user } = useAuth();
  const [events,     setEvents]     = useState<AuditEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q,          setQ]          = useState("");
  const [action,     setAction]     = useState<string>("all");

  const fetchAudit = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res  = await fetch("http://localhost:5000/api/audit", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load audit");
      setEvents(data.events ?? []);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const rows = useMemo(() => {
    return events.filter(e => {
      const matchQ = !q ||
        e.fileName?.toLowerCase().includes(q.toLowerCase()) ||
        e.actor?.toLowerCase().includes(q.toLowerCase()) ||
        e.txHash?.toLowerCase().includes(q.toLowerCase());
      const matchA = action === "all" || e.action === action;
      return matchQ && matchA;
    });
  }, [q, action, events]);

  const uniqueActions = useMemo(() => [...new Set(events.map(e => e.action))], [events]);

  // ── PDF Export ────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    // Header banner
    doc.setFillColor(30, 30, 46);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 56, "F");

    // Logo text
    doc.setTextColor(139, 92, 246);   // violet-500
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("GenoVault", 36, 30);

    doc.setTextColor(200, 200, 220);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Secure Genomics Platform", 36, 44);

    // Title block
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Blockchain Audit Trail", 36, 80);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(160, 160, 180);
    doc.text(
      `Exported by: ${user?.name ?? "Unknown"}  |  Role: ${user?.role ?? "—"}  |  Date: ${new Date().toLocaleString("en-IN")}`,
      36, 96
    );
    doc.text(
      `Network: Ethereum Sepolia Testnet  |  Total events: ${rows.length}`,
      36, 110
    );

    // Table
    autoTable(doc, {
      startY: 126,
      head: [["Time", "Action", "File", "Actor", "Tx Hash", "Block", "Gas Used"]],
      body: rows.map(r => [
        formatDate(r.timestamp),
        r.action,
        r.fileName,
        r.actor,
        r.txHash ?? "Off-chain",
        r.blockNumber != null ? String(r.blockNumber) : "—",
        r.gasUsed ?? "—",
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 5,
        overflow: "linebreak",
        textColor: [220, 220, 235],
        fillColor: [22, 22, 35],
        lineColor: [50, 50, 70],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [50, 30, 90],
        textColor: [200, 180, 255],
        fontStyle: "bold",
        fontSize: 8.5,
      },
      alternateRowStyles: {
        fillColor: [28, 28, 44],
      },
      columnStyles: {
        0: { cellWidth: 95  },   // Time
        1: { cellWidth: 65  },   // Action
        2: { cellWidth: 190 },   // File
        3: { cellWidth: 80  },   // Actor
        4: { cellWidth: 130 },   // Tx Hash
        5: { cellWidth: 55  },   // Block
        6: { cellWidth: 60  },   // Gas
      },
      didDrawPage: (hookData) => {
        // Footer on every page
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFillColor(30, 30, 46);
        doc.rect(0, pageH - 24, pageW, 24, "F");
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 140);
        doc.text(
          "This document is an official GenoVault audit export. All blockchain events are tamper-proof and recorded on Ethereum Sepolia Testnet.",
          36, pageH - 10
        );
        doc.text(
          `Page ${hookData.pageNumber}`,
          pageW - 50, pageH - 10
        );
      },
    });

    doc.save(`genovault-audit-${Date.now()}.pdf`);
  };

  return (
    <>
      <PageHeader
        title="Blockchain Audit Trail"
        description="Tamper-proof, append-only record of every action verified on Ethereum Sepolia Testnet."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchAudit(true)} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={loading || rows.length === 0}>
              <FileDown className="h-4 w-4 mr-1.5" />Export PDF
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card className="p-4 mb-4 shadow-card">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by file, actor or tx hash..."
              value={q} onChange={e => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {uniqueActions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Tx Hash</TableHead>
              <TableHead className="text-right">Block</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />Loading blockchain events…
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading && error && (
              <TableRow>
                <TableCell colSpan={6} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-red-400">
                    <AlertTriangle className="h-7 w-7" />
                    <p className="text-sm">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => fetchAudit()}>Retry</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading && !error && rows.map((r, i) => {
              const meta = actionMeta[r.action] ?? { icon: FileCheck2, color: "bg-muted text-muted-foreground" };
              const Icon = meta.icon;
              return (
                <motion.tr
                  key={`${r.txHash ?? r.eventType}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border hover:bg-muted/40 transition-colors"
                >
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.timestamp)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`gap-1 ${meta.color}`}>
                      <Icon className="h-3 w-3" />{r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[180px] truncate" title={r.fileName}>{r.fileName}</TableCell>
                  <TableCell className="text-sm">{r.actor}</TableCell>
                  <TableCell><TxBadge txHash={r.txHash} etherscanUrl={r.etherscanUrl} /></TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{r.blockNumber ?? "—"}</TableCell>
                </motion.tr>
              );
            })}

            {!loading && !error && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  {events.length === 0 ? "No blockchain events recorded yet." : "No matching events."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Footer */}
        {!loading && !error && events.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>{rows.length} of {events.length} event{events.length !== 1 ? "s" : ""}</span>
            <a href="https://sepolia.etherscan.io" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:underline">
              Etherscan <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </Card>
    </>
  );
};

export default Audit;
