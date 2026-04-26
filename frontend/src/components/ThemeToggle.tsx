import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";

export const ThemeToggle = ({ className = "" }: { className?: string }) => {
  const { theme, toggle } = useTheme();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      className={`relative overflow-hidden ${className}`}
    >
      <Sun className={`h-5 w-5 transition-all duration-300 ${theme === "dark" ? "scale-0 -rotate-90" : "scale-100 rotate-0"}`} />
      <Moon className={`absolute h-5 w-5 transition-all duration-300 ${theme === "dark" ? "scale-100 rotate-0" : "scale-0 rotate-90"}`} />
    </Button>
  );
};
