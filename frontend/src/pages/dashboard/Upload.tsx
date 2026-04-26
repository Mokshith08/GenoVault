import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, FileText, X, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { mockFiles, FileItem } from "@/lib/mockData";

interface UploadingFile { id: string; name: string; size: string; progress: number; }

const Upload = () => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [files, setFiles] = useState<FileItem[]>(mockFiles);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes > 1e9) return (bytes / 1e9).toFixed(2) + " GB";
    if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + " MB";
    return (bytes / 1e3).toFixed(0) + " KB";
  };

  const startUpload = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach(f => {
      const id = crypto.randomUUID();
      const entry: UploadingFile = { id, name: f.name, size: formatSize(f.size), progress: 0 };
      setUploading(u => [...u, entry]);

      const interval = setInterval(() => {
        setUploading(u => u.map(x => x.id === id ? { ...x, progress: Math.min(100, x.progress + Math.random() * 18) } : x));
      }, 250);

      setTimeout(() => {
        clearInterval(interval);
        setUploading(u => u.filter(x => x.id !== id));
        const newFile: FileItem = {
          id, name: f.name, size: entry.size,
          uploadedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
          status: "Encrypted",
          hash: "0x" + Math.random().toString(16).slice(2, 6) + "..." + Math.random().toString(16).slice(2, 6),
          verified: true,
        };
        setFiles(fs => [newFile, ...fs]);
        toast.success(`${f.name} encrypted & stored`);
      }, 2200);
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    startUpload(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles(fs => fs.filter(f => f.id !== id));
    toast.info("File removed from list");
  };

  return (
    <>
      <PageHeader title="Files" description="Upload genomic datasets — encrypted client-side before storage." />

      <Card
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`relative overflow-hidden border-2 border-dashed transition-all p-10 sm:p-14 text-center cursor-pointer ${dragActive ? "border-primary bg-accent/40 scale-[1.01]" : "border-border hover:border-primary/40"}`}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => startUpload(e.target.files)} />
        <motion.div animate={{ y: dragActive ? -4 : 0 }} className="flex flex-col items-center">
          <div className="relative mb-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-primary shadow-elegant flex items-center justify-center">
              <UploadCloud className="h-8 w-8 text-primary-foreground" />
            </div>
            {dragActive && <div className="absolute inset-0 rounded-2xl bg-gradient-primary blur-xl opacity-60 -z-10" />}
          </div>
          <h3 className="font-semibold text-lg">Drop genomic files here</h3>
          <p className="text-sm text-muted-foreground mt-1">or click to browse · VCF, FASTA, BAM, FASTQ supported</p>
          <Button className="mt-5 bg-gradient-primary hover:opacity-90 shadow-elegant" type="button">Choose files</Button>
          <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> AES-256 encryption applied before transit
          </p>
        </motion.div>
      </Card>

      <AnimatePresence>
        {uploading.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 space-y-3">
            {uploading.map(u => (
              <Card key={u.id} className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  <span className="text-sm font-medium flex-1 truncate">{u.name}</span>
                  <span className="text-xs text-muted-foreground">{u.size}</span>
                  <span className="text-xs font-mono text-primary w-10 text-right">{Math.round(u.progress)}%</span>
                </div>
                <Progress value={u.progress} className="h-1.5" />
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="mt-6 p-6 shadow-card">
        <h3 className="font-semibold mb-4">Your files ({files.length})</h3>
        <div className="space-y-2">
          {files.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors group"
            >
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <FileText className="h-4 w-4 text-accent-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.size} · {f.uploadedAt} · <span className="font-mono">{f.hash}</span></p>
              </div>
              <Badge className={f.status === "Encrypted" ? "bg-gradient-primary text-primary-foreground" : "bg-success text-success-foreground"}>
                <CheckCircle2 className="h-3 w-3 mr-1" />{f.status}
              </Badge>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeFile(f.id)}>
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          ))}
        </div>
      </Card>
    </>
  );
};

export default Upload;
