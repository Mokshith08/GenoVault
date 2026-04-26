import { motion, type Variants } from "framer-motion";
import { Database, ClipboardList, CheckCircle, DatabaseZap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  {
    title: "Available Datasets",
    value: "124",
    icon: Database,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    title: "Requests Sent",
    value: "12",
    icon: ClipboardList,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    title: "Approved Requests",
    value: "8",
    icon: CheckCircle,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    title: "Active Sessions",
    value: "3",
    icon: DatabaseZap,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

export default function DashboardOverview() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard Overview</h2>
        <p className="text-muted-foreground mt-1">
          Welcome back to your researcher portal. Here is a summary of your activity.
        </p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        {stats.map((stat) => (
          <motion.div key={stat.title} variants={itemVariants}>
            <Card className="hover:shadow-md transition-all duration-300 hover:-translate-y-1 overflow-hidden group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-md ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
      
      {/* Empty State / Welcome Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="mt-8 rounded-xl border bg-card text-card-foreground shadow-sm p-8 flex flex-col items-center justify-center text-center min-h-[300px]"
      >
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <DatabaseZap className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-bold mb-2">Explore Genomic Data</h3>
        <p className="text-muted-foreground max-w-md mb-6">
          Access high-quality, securely managed genomic datasets. Find the data you need for your research and request access easily.
        </p>
      </motion.div>
    </div>
  );
}
