import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ScrollText,
  Brain,
  Wrench,
  Lightbulb,
  Clock,
  Network,
  Library,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  FolderKanban,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui.store';
import { Button } from '@/components/ui/button';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: null,
    items: [{ path: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Memory',
    items: [
      { path: '/guidelines', label: 'Guidelines', icon: ScrollText },
      { path: '/knowledge', label: 'Knowledge', icon: Brain },
      { path: '/tools', label: 'Tools', icon: Wrench },
      { path: '/experiences', label: 'Experiences', icon: Lightbulb },
    ],
  },
  {
    title: 'Tracking',
    items: [
      { path: '/tasks', label: 'Tasks', icon: CheckSquare },
      { path: '/topics', label: 'Topics', icon: FolderKanban },
      { path: '/sessions', label: 'Sessions (Legacy)', icon: Clock },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { path: '/graph', label: 'Graph', icon: Network },
      { path: '/librarian', label: 'Librarian', icon: Library },
      { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
];

export function Sidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        'flex flex-col border-r border-white/5 glass transition-all duration-300 z-20',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-white/5 px-4">
        {!sidebarCollapsed && (
          <span className="text-xl font-bold tracking-tight bg-gradient-to-br from-white to-white/40 bg-clip-text text-transparent">
            Agent Memory
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          className={cn("text-muted-foreground hover:text-white transition-colors", sidebarCollapsed && 'mx-auto')}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-6 p-3 overflow-y-auto scrollbar-thin">
        {navSections.map((section, sectionIndex) => (
          <div key={section.title ?? 'main'} className="space-y-1">
            {section.title && !sidebarCollapsed && (
              <h3 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
                {section.title}
              </h3>
            )}
            {section.title && sidebarCollapsed && sectionIndex > 0 && (
              <div className="mx-3 border-t border-white/5 my-4" />
            )}
            {section.items.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 group relative',
                    isActive
                      ? 'bg-primary/10 text-primary shadow-[0_0_20px_rgba(99,102,241,0.1)]'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                    sidebarCollapsed && 'justify-center px-2'
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 w-1 h-5 bg-primary rounded-r-full" />
                  )}
                  <Icon className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-200",
                    isActive ? "scale-110" : "group-hover:scale-110"
                  )} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
