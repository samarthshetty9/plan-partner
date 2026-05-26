import { ReactNode, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Heart,
  Activity,
  CalendarDays,
  Upload,
  LogOut,
  Menu,
  X,
  Home,
  MessageSquare,
  FlaskConical,
  Shield,
  UtensilsCrossed,
  Link2,
  Star,
  Users,
  Pill,
  Phone,
  Search,
  Briefcase,
  HeartPulse,
} from "lucide-react";
import { PatientPwaLink } from "@/components/PatientPwaLink";

const navItems = [
  { to: "/patient", icon: MessageSquare, label: "AI Assistant", exact: true },
  { to: "/patient/ai-doctor", icon: Phone, label: "AI Doctor" },
  { to: "/patient/overview", icon: Home, label: "Overview" },
  { to: "/patient/cases/new", icon: Search, label: "Request Treatment" },
  { to: "/patient/cases", icon: Briefcase, label: "My Treatment Requests" },
  { to: "/patient/care-plan", icon: HeartPulse, label: "My Care Plans", exact: true },
  { to: "/patient/care-plan/channel", icon: Activity, label: "Care Plan Channel" },
  { to: "/patient/accountability", icon: Users, label: "Family & visibility" },
  { to: "/patient/connect-doctor", icon: Link2, label: "Connect to doctor" },
  { to: "/patient/medications", icon: Pill, label: "Medications" },
  { to: "/patient/vitals", icon: Activity, label: "Vitals" },
  { to: "/patient/documents-results", icon: Upload, label: "Documents & Results" },
  { to: "/patient/appointments", icon: CalendarDays, label: "Appointments" },
  { to: "/patient/feedback", icon: Star, label: "Feedback" },
  { to: "/patient/food-analysis", icon: UtensilsCrossed, label: "Food Analysis" },
  { to: "/patient/fitness-tracking", icon: Activity, label: "Fitness Tracking" },
  { to: "/patient/vault", icon: Shield, label: "Health Vault" },
];

export function PatientLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] pwa-screen flex bg-background w-full max-w-full overflow-x-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 w-64 max-w-[85vw] h-full max-h-[100dvh] bg-card border-r border-border flex flex-col transition-transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="safe-area-header min-h-[4rem] flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Heart className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-heading font-bold text-foreground truncate">My Health</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="touch-target p-2 rounded-xl hover:bg-muted active:bg-muted text-muted-foreground flex-shrink-0 touch-manipulation" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden min-h-0">
          {navItems.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 min-h-[44px] px-3 py-3 rounded-xl text-sm font-medium transition-colors touch-manipulation ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <PatientPwaLink />
        <div className="p-3 border-t border-border safe-area-bottom">
          <button
            onClick={signOut}
            className="flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground w-full transition-colors touch-manipulation"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden min-h-[100dvh]">
        <header className="safe-area-header min-h-[3.5rem] sm:min-h-[4rem] border-b border-border bg-card flex items-center gap-1 sm:gap-2 sticky top-0 z-30 flex-shrink-0 px-4 py-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="touch-target p-2 rounded-xl hover:bg-muted active:bg-muted text-muted-foreground flex-shrink-0 touch-manipulation -ml-0.5"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6 sm:w-5 sm:h-5" />
          </button>
          <h2 className="text-base sm:text-lg font-heading font-semibold text-foreground truncate min-w-0 flex-1 pl-1">
            {navItems.find((i) => i.exact ? location.pathname === i.to : location.pathname === i.to || location.pathname.startsWith(i.to + "/"))?.label || "My Health"}
          </h2>
          <Link
            to="/patient"
            className="touch-target flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-primary hover:bg-primary/10 active:bg-primary/20 transition-colors touch-manipulation"
            aria-label="Go to Home"
          >
            <Home className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </header>
        <main className="safe-area-bottom flex-1 p-4 lg:p-6 overflow-x-hidden overflow-y-auto min-w-0 pwa-safe-x">
          {children}
        </main>
      </div>
    </div>
  );
}

// Export the sidebar opener for use by chat page
export function PatientLayoutWithChat({ children }: { children: (onOpenMenu: () => void) => ReactNode }) {
  const { signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] pwa-screen flex bg-background w-full max-w-full overflow-x-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 w-64 max-w-[85vw] h-full max-h-[100dvh] bg-card border-r border-border flex flex-col transition-transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="safe-area-header min-h-[4rem] flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Heart className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-heading font-bold text-foreground truncate">My Health</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="touch-target p-2 rounded-xl hover:bg-muted active:bg-muted text-muted-foreground flex-shrink-0 touch-manipulation" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden min-h-0">
          {navItems.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 min-h-[44px] px-3 py-3 rounded-xl text-sm font-medium transition-colors touch-manipulation ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <PatientPwaLink />
        <div className="p-3 border-t border-border safe-area-bottom">
          <button
            onClick={signOut}
            className="flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground w-full transition-colors touch-manipulation"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {children(() => setSidebarOpen(true))}
    </div>
  );
}
