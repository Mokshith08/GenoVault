import { motion } from "framer-motion";
import { DatabaseZap, Database, ClipboardList, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardOverview() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard Overview</h2>
        <p className="text-muted-foreground mt-1">
          Welcome to your researcher portal. Submit access requests to explore genomic datasets.
        </p>
      </div>

      {/* Stats — all 0 until real data arrives */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1 }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        {[
          { title: "Available Datasets", value: "—", icon: Database,       color: "text-blue-500",   bg: "bg-blue-500/10"   },
          { title: "Requests Sent",      value: "—", icon: ClipboardList,  color: "text-purple-500", bg: "bg-purple-500/10" },
          { title: "Approved Requests",  value: "—", icon: CheckCircle,    color: "text-green-500",  bg: "bg-green-500/10"  },
          { title: "Active Sessions",    value: "—", icon: DatabaseZap,    color: "text-primary",    bg: "bg-primary/10"    },
        ].map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
          >
            <Card className="hover:shadow-md transition-all duration-300 hover:-translate-y-1 overflow-hidden group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-md ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-muted-foreground/50">{stat.value}</div>
                <p className="text-xs text-muted-foreground/50 mt-1">No data yet</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Empty-state welcome card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="rounded-xl border bg-card shadow-sm p-10 flex flex-col items-center justify-center text-center min-h-[260px]"
      >
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <DatabaseZap className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-bold mb-2">Explore Genomic Data</h3>
        <p className="text-muted-foreground max-w-md">
          Browse available datasets, submit access requests, and manage your approved sessions —
          all from the sidebar navigation.
        </p>
      </motion.div>
    </div>
  );
}
