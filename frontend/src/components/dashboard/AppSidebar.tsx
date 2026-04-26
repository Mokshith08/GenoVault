import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  LayoutDashboard, UploadCloud, Inbox, ShieldCheck, ScrollText, FileSearch, LogOut,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const ownerItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Files", url: "/dashboard/upload", icon: UploadCloud },
  { title: "Requests", url: "/dashboard/requests", icon: Inbox },
  { title: "Access Control", url: "/dashboard/access", icon: ShieldCheck },
  { title: "Verification", url: "/dashboard/verification", icon: FileSearch },
  { title: "Audit Trail", url: "/dashboard/audit", icon: ScrollText },
];

const researcherItems = [
  { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
  { title: "Datasets", url: "/dashboard/requests", icon: Inbox },
  { title: "My Access", url: "/dashboard/access", icon: ShieldCheck },
  { title: "Verification", url: "/dashboard/verification", icon: FileSearch },
  { title: "Audit Trail", url: "/dashboard/audit", icon: ScrollText },
];

export const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = user?.role === "researcher" ? researcherItems : ownerItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center ${collapsed ? "justify-center px-1" : "px-2"} py-2`}>
          {collapsed ? (
            <div className="h-9 w-9 rounded-xl bg-gradient-primary shadow-elegant" />
          ) : (
            <Logo />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => {
                const active = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
                      <NavLink to={item.url} end className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => { logout(); navigate("/"); }} tooltip="Sign out">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
