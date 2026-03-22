import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  Tags,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  X,
  Wallet,
} from "lucide-react";
import { cn } from "../../lib/utils";

const navItems = [
  { to: "/",             icon: LayoutDashboard, label: "Dashboard"    },
  { to: "/transactions", icon: ArrowLeftRight,  label: "Transactions" },
  { to: "/budgets",      icon: Target,          label: "Budgets"      },
  { to: "/categories",   icon: Tags,            label: "Categories"   },
  { to: "/accounts",     icon: Wallet,          label: "Accounts"     },
];

interface Props {
  mobileOpen:        boolean;
  onMobileClose:     () => void;
  collapsed:         boolean;
  onToggleCollapse:  () => void;
}

export function Sidebar({ mobileOpen, onMobileClose, collapsed, onToggleCollapse }: Props) {
  return (
    <aside
      className={cn(
        // ── base styles ──
        "flex flex-col bg-card border-r z-40 transition-all duration-300 ease-in-out",

        // ── desktop: static in flex layout, collapsible width ──
        "md:relative md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-64",

        // ── mobile: fixed drawer, slides in/out via translate ──
        "fixed inset-y-0 left-0 w-72",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center border-b",
        collapsed ? "justify-center p-3" : "justify-between p-4"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight">FinanceCtrl</p>
              <p className="text-[10px] text-muted-foreground truncate">Personal Finance Controller</p>
            </div>
          </div>
        )}
        {collapsed && <TrendingUp className="h-5 w-5 text-primary" />}

        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="md:hidden p-1 rounded-md hover:bg-accent transition-colors ml-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 p-2 space-y-1 overflow-y-auto", collapsed && "px-2")}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onMobileClose}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer: collapse toggle (desktop only) + storage note */}
      <div className={cn("border-t p-2", collapsed ? "flex justify-center" : "space-y-2")}>
        {/* Desktop collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex items-center justify-center w-full p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-xs gap-1"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>
          }
        </button>

        {!collapsed && (
          <p className="text-[10px] text-muted-foreground text-center px-2">
            Data stored locally on your device
          </p>
        )}
      </div>
    </aside>
  );
}
