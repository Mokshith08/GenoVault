import { motion } from "framer-motion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClipboardList } from "lucide-react";

export default function MyRequests() {
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
              <TableRow>
                <TableCell colSpan={4} className="h-52 text-center">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col items-center justify-center opacity-70"
                  >
                    <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-base font-medium">No requests yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      When you request dataset access, they will appear here.
                    </p>
                  </motion.div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
