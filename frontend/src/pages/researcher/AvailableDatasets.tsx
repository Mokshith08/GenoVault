import { motion } from "framer-motion";
import { Search, Filter, Database } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AvailableDatasets() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Available Datasets</h2>
          <p className="text-muted-foreground mt-1">Browse and request access to genomic datasets.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search datasets..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" title="Filter options">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Empty state */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center text-center py-20 rounded-xl border border-dashed"
      >
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Database className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No Datasets Available</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Datasets shared by data owners will appear here. Check back soon or contact your administrator.
        </p>
      </motion.div>
    </div>
  );
}
