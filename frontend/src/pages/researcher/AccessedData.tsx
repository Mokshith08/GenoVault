import { motion } from "framer-motion";
import { DatabaseZap } from "lucide-react";

export default function AccessedData() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Accessed Data</h2>
        <p className="text-muted-foreground mt-1">
          Manage active sessions and verify genomic data integrity before use.
        </p>
      </div>

      {/* Empty state */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center text-center py-20 rounded-xl border border-dashed"
      >
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <DatabaseZap className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Active Data Sessions</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Approved datasets will appear here with live countdown timers and integrity verification options.
        </p>
      </motion.div>
    </div>
  );
}
