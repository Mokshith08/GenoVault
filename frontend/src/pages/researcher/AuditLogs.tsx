import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const MOCK_LOGS = [
  {
    id: "LOG-091",
    action: "Data Downloaded",
    dataset: "Global Oncology Genome Atlas",
    timestamp: "2023-12-01T14:32:00Z",
    status: "Success",
  },
  {
    id: "LOG-090",
    action: "Integrity Verified",
    dataset: "Global Oncology Genome Atlas",
    timestamp: "2023-12-01T14:30:15Z",
    status: "Success",
  },
  {
    id: "LOG-089",
    action: "Session Initiated",
    dataset: "Global Oncology Genome Atlas",
    timestamp: "2023-12-01T10:00:00Z",
    status: "Success",
  },
  {
    id: "LOG-088",
    action: "Access Requested",
    dataset: "Global Oncology Genome Atlas",
    timestamp: "2023-11-15T10:23:00Z",
    status: "Pending",
  },
  {
    id: "LOG-087",
    action: "Integrity Verified",
    dataset: "Population Variants (Alpha)",
    timestamp: "2023-11-12T09:12:00Z",
    status: "Failed",
  },
];

export default function AuditLogs() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredLogs = MOCK_LOGS.filter(
    (log) =>
      log.dataset.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Audit Logs</h2>
          <p className="text-muted-foreground mt-1">Immutable record of your research activities and access history.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search logs..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead className="text-right">Event Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log, idx) => (
                  <TableRow key={log.id} className="group hover:bg-muted/50">
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        {log.action}
                      </motion.div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.dataset}</TableCell>
                    <TableCell className="text-right">
                      {log.status === "Success" ? (
                        <Badge variant="outline" className="text-success border-success/30">Success</Badge>
                      ) : log.status === "Failed" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <Badge variant="secondary">{log.status}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center opacity-70">
                      <History className="h-10 w-10 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No audit logs found</p>
                      <p className="text-sm text-muted-foreground">Try clearing your search filters.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
