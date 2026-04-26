import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Filter, Database, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// Mock Data
const MOCK_DATASETS = [
  {
    id: "ds-001",
    name: "Global Oncology Genome Atlas",
    owner: "Dr. Sarah Chen",
    description: "Comprehensive genomic variants dataset across 50+ cancer types collected from multiple research institutes.",
    size: "4.2 TB",
    type: "Oncology",
    tags: ["Cancer", "WGS", "Variants"],
  },
  {
    id: "ds-002",
    name: "1000 Genomes Project (Phase 3)",
    owner: "International Consortium",
    description: "A detailed catalogue of human genetic variation, including SNPs, structural variants, and their haplotype context.",
    size: "1.5 TB",
    type: "Population",
    tags: ["SNPs", "VCF", "Population Diversity"],
  },
  {
    id: "ds-003",
    name: "Rare Disease Pedigree Variants",
    owner: "Boston Children's Auth",
    description: "De-identified exome sequencing data from families with undiagnosed rare pediatric conditions.",
    size: "850 GB",
    type: "Rare Disease",
    tags: ["Pediatric", "WES", "Trios"],
  },
];

export default function AvailableDatasets() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<typeof MOCK_DATASETS[0] | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [purpose, setPurpose] = useState("");

  const filteredDatasets = MOCK_DATASETS.filter(
    (ds) =>
      ds.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ds.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ds.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRequestClick = (dataset: typeof MOCK_DATASETS[0]) => {
    setSelectedDataset(dataset);
    setPurpose("");
    setIsModalOpen(true);
  };

  const handleSubmitRequest = () => {
    if (!purpose.trim()) {
      toast.error("Please provide a purpose for access.");
      return;
    }
    
    // Mock API call
    setTimeout(() => {
      setIsModalOpen(false);
      toast.success(`Access request sent for ${selectedDataset?.name}`, {
        description: "The data owner has been notified. You can track this in 'My Requests'.",
      });
      setSelectedDataset(null);
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Available Datasets</h2>
          <p className="text-muted-foreground mt-1">Browse, search, and request access to genomic datasets.</p>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-4">
        {filteredDatasets.map((dataset, idx) => (
          <motion.div
            key={dataset.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.1 }}
          >
            <Card className="h-full flex flex-col hover:shadow-md transition-shadow group">
              <CardHeader>
                <div className="flex justify-between items-start pb-2">
                  <Badge variant="secondary" className="mb-2 bg-primary/10 text-primary hover:bg-primary/20">{dataset.type}</Badge>
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded-md">{dataset.size}</span>
                </div>
                <CardTitle className="text-lg line-clamp-1 group-hover:text-primary transition-colors">{dataset.name}</CardTitle>
                <CardDescription className="flex items-center gap-1.5 mt-1">
                  <Database className="h-3 w-3" /> {dataset.owner}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {dataset.description}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {dataset.tags.map(tag => (
                    <Badge key={tag} variant="outline" className="text-[10px] py-0">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t border-border/50">
                <Button 
                  className="w-full gap-2 transition-transform active:scale-[0.98]" 
                  onClick={() => handleRequestClick(dataset)}
                >
                  <Send className="h-4 w-4" /> Request Access
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ))}

        {filteredDatasets.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-70">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No datasets found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your search query.</p>
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Request Dataset Access</DialogTitle>
            <DialogDescription>
              Submit an access request for <strong className="text-foreground">{selectedDataset?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose of Access</Label>
              <Textarea
                id="purpose"
                placeholder="Describe why you need access to this data and your research goals..."
                className="h-32 resize-none"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Your request will be reviewed by {selectedDataset?.owner}. Approval usually takes 1-2 business days.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitRequest}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
