export interface FileItem {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  status: "Encrypted" | "Stored" | "Processing";
  hash: string;
  verified: boolean;
}

export interface AccessRequest {
  id: string;
  dataset: string;
  researcher: string;
  email: string;
  purpose: string;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
}

export interface ActiveAccess {
  id: string;
  user: string;
  dataset: string;
  grantedAt: number; // epoch ms
  expiresAt: number;
  status: "Active" | "Expired";
}

export interface AuditEntry {
  id: string;
  user: string;
  action: "Upload" | "Request" | "Access" | "Approve" | "Revoke" | "Verify";
  target: string;
  timestamp: string;
}

export interface Dataset {
  id: string;
  name: string;
  owner: string;
  samples: number;
  type: string;
  description: string;
}

const now = Date.now();

export const mockFiles: FileItem[] = [
  { id: "f1", name: "genome_sample_001.vcf", size: "1.2 GB", uploadedAt: "2025-04-12 10:24", status: "Encrypted", hash: "0x9af3...e21b", verified: true },
  { id: "f2", name: "exome_panel_22.fasta", size: "640 MB", uploadedAt: "2025-04-11 16:02", status: "Stored", hash: "0x1c7d...9f0a", verified: true },
  { id: "f3", name: "rnaseq_run_07.bam", size: "2.4 GB", uploadedAt: "2025-04-10 09:13", status: "Encrypted", hash: "0x8e22...4471", verified: false },
  { id: "f4", name: "variant_calls.vcf.gz", size: "210 MB", uploadedAt: "2025-04-09 14:48", status: "Stored", hash: "0xb1ca...77d2", verified: true },
];

export const mockRequests: AccessRequest[] = [
  { id: "r1", dataset: "genome_sample_001.vcf", researcher: "Dr. Aditi Rao", email: "aditi@bioinst.org", purpose: "Cardio variant study", requestedAt: "2025-04-13 08:11", status: "Pending" },
  { id: "r2", dataset: "exome_panel_22.fasta", researcher: "Dr. Liam Chen", email: "liam@genomelab.io", purpose: "Population genetics", requestedAt: "2025-04-12 21:42", status: "Pending" },
  { id: "r3", dataset: "variant_calls.vcf.gz", researcher: "Dr. Maya Singh", email: "maya@oncoresearch.org", purpose: "Oncology biomarkers", requestedAt: "2025-04-11 12:05", status: "Approved" },
];

export const mockActive: ActiveAccess[] = [
  { id: "a1", user: "Dr. Maya Singh", dataset: "variant_calls.vcf.gz", grantedAt: now - 2 * 3600 * 1000, expiresAt: now + 22 * 3600 * 1000, status: "Active" },
  { id: "a2", user: "Dr. Noah Patel", dataset: "exome_panel_22.fasta", grantedAt: now - 23 * 3600 * 1000, expiresAt: now + 1 * 3600 * 1000, status: "Active" },
  { id: "a3", user: "Dr. Sara Kim", dataset: "rnaseq_run_07.bam", grantedAt: now - 30 * 3600 * 1000, expiresAt: now - 6 * 3600 * 1000, status: "Expired" },
];

export const mockAudit: AuditEntry[] = [
  { id: "l1", user: "owner@geno.io", action: "Upload", target: "genome_sample_001.vcf", timestamp: "2025-04-12 10:24" },
  { id: "l2", user: "aditi@bioinst.org", action: "Request", target: "genome_sample_001.vcf", timestamp: "2025-04-13 08:11" },
  { id: "l3", user: "owner@geno.io", action: "Approve", target: "variant_calls.vcf.gz", timestamp: "2025-04-13 09:02" },
  { id: "l4", user: "maya@oncoresearch.org", action: "Access", target: "variant_calls.vcf.gz", timestamp: "2025-04-13 09:14" },
  { id: "l5", user: "owner@geno.io", action: "Revoke", target: "rnaseq_run_07.bam", timestamp: "2025-04-13 11:30" },
  { id: "l6", user: "system", action: "Verify", target: "exome_panel_22.fasta", timestamp: "2025-04-13 12:00" },
];

export const mockDatasets: Dataset[] = [
  { id: "d1", name: "genome_sample_001.vcf", owner: "Dr. R. Verma", samples: 1, type: "VCF", description: "Whole genome variant calls, single donor." },
  { id: "d2", name: "exome_panel_22.fasta", owner: "Dr. R. Verma", samples: 24, type: "FASTA", description: "Targeted exome panel, chromosome 22." },
  { id: "d3", name: "rnaseq_run_07.bam", owner: "Dr. R. Verma", samples: 12, type: "BAM", description: "RNA-Seq alignments, liver tissue cohort." },
  { id: "d4", name: "variant_calls.vcf.gz", owner: "Dr. R. Verma", samples: 48, type: "VCF.GZ", description: "Compressed variant calls, oncology cohort." },
];
