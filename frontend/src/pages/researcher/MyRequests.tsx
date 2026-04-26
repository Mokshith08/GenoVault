import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList } from "lucide-react";

const MOCK_REQUESTS = [
  {
    id: "REQ-001",
    dataset: "Global Oncology Genome Atlas",
    owner: "Dr. Sarah Chen",
    timestamp: "2023-11-15T10:23:00Z",
    status: "Approved",
  },
  {
    id: "REQ-002",
    dataset: "1000 Genomes Project (Phase 3)",
    owner: "International Consortium",
    timestamp: "2023-11-18T14:45:00Z",
    status: "Pending",
  },
  {
    id: "REQ-003",
    dataset: "Rare Disease Pedigree Variants",
    owner: "Boston Children's Auth",
    timestamp: "2023-11-10T09:12:00Z",
    status: "Rejected",
  },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "Approved":
      return <Badge className="bg-success hover:bg-success/80 text-success-foreground">Approved</Badge>;
    case "Rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "Pending":
    default:
      return <Badge variant="outline" className="text-warning border-warning/50">Pending</Badge>;
  }
};

export default function MyRequests() {
  const [loading, setLoading] = useState(true);

  // Simulate network fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Requests</h2>
          <p className="text-muted-foreground mt-1">Track the status of your data access applications.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[300px]">Dataset</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Date Requested</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Skeleton loading state
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-[250px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-[80px] ml-auto rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : MOCK_REQUESTS.length > 0 ? (
                MOCK_REQUESTS.map((request, idx) => (
                  <TableRow key={request.id} className="group transition-colors hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                      >
                        {request.dataset}
                      </motion.div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{request.owner}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(request.timestamp).toLocaleDateString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {getStatusBadge(request.status)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center opacity-70">
                      <ClipboardList className="h-10 w-10 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium">No requests yet</p>
                      <p className="text-sm text-muted-foreground">When you request dataset access, they will appear here.</p>
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
