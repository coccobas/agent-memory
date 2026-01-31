import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ScrollText,
  Brain,
  Wrench,
  Lightbulb,
  Clock,
  PlayCircle,
  Network,
  Library,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/guidelines", label: "Guidelines", icon: ScrollText },
  { path: "/knowledge", label: "Knowledge", icon: Brain },
  { path: "/tools", label: "Tools", icon: Wrench },
  { path: "/experiences", label: "Experiences", icon: Lightbulb },
  { path: "/sessions", label: "Sessions", icon: Clock },
  { path: "/episodes", label: "Episodes", icon: PlayCircle },
  { path: "/graph", label: "Graph", icon: Network },
  { path: "/librarian", label: "Librarian", icon: Library },
  { path: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        "flex flex-col border-r border-border bg-card transition-all duration-300",
        sidebarCollapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {!sidebarCollapsed && (
          <span className="text-lg font-semibold text-foreground">
            Agent Memory
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          className={cn(sidebarCollapsed && "mx-auto")}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                sidebarCollapsed && "justify-center px-2",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
