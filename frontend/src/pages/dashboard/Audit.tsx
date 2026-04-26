import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Search, Download, UploadCloud, Inbox, ShieldCheck, KeyRound, Ban, FileCheck2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mockAudit } from "@/lib/mockData";

const actionMeta = {
  Upload: { icon: UploadCloud, color: "bg-accent text-accent-foreground" },
  Request: { icon: Inbox, color: "bg-warning/20 text-warning" },
  Access: { icon: KeyRound, color: "bg-primary/20 text-primary" },
  Approve: { icon: ShieldCheck, color: "bg-success/20 text-success" },
  Revoke: { icon: Ban, color: "bg-destructive/20 text-destructive" },
  Verify: { icon: FileCheck2, color: "bg-accent text-accent-foreground" },
} as const;

const Audit = () => {
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("all");

  const rows = useMemo(() => {
    return mockAudit.filter(a => {
      const matchQ = !q || a.user.toLowerCase().includes(q.toLowerCase()) || a.target.toLowerCase().includes(q.toLowerCase());
      const matchA = action === "all" || a.action === action;
      return matchQ && matchA;
    });
  }, [q, action]);

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="Tamper-proof, append-only record of every action across the vault."
        actions={<Button variant="outline"><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>}
      />

      <Card className="p-4 mb-4 shadow-card">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by user or target..." value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.keys(actionMeta).map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="text-right">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const meta = actionMeta[r.action];
              const Icon = meta.icon;
              return (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-border hover:bg-muted/40 transition-colors"
                >
                  <TableCell className="font-medium">{r.user}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`gap-1 ${meta.color}`}>
                      <Icon className="h-3 w-3" />{r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.target}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{r.timestamp}</TableCell>
                </motion.tr>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">No matching events.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
};

export default Audit;
