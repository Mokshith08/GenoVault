import { ReactNode } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accent?: "primary" | "success" | "warning" | "destructive";
  delay?: number;
  children?: ReactNode;
}

const accentMap = {
  primary: "bg-gradient-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  destructive: "bg-destructive text-destructive-foreground",
};

export const StatCard = ({ title, value, icon: Icon, trend, accent = "primary", delay = 0, children }: Props) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow border-border/60">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{title}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
            {trend && <p className="mt-1 text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shadow-elegant ${accentMap[accent]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {children}
      </Card>
    </motion.div>
  );
};
