import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { NotificationCenter } from "@/components/NotificationCenter";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarDays,
  LogOut,
  MessageSquare,
  Menu,
  X,
  Activity,
  FileText,
  Upload,
  ClipboardCheck,
  Building2,
  Link,
  AlertTriangle,
  Shield,
  ChevronDown,
  Clock,
  Star,
  ClipboardList,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", tooltip: "Overview of your practice" },
  { to: "/dashboard/patients", icon: Users, label: "Patients", tooltip: "Manage your patient list" },
  { to: "/dashboard/care-plans", icon: ClipboardList, label: "Care Plans", tooltip: "View and assign care plans" },
  { to: "/dashboard/enrollments", icon: UserPlus, label: "Enrollments", tooltip: "Patient care plan enrollments" },
  { to: "/dashboard/appointments", icon: CalendarDays, label: "Appointments", tooltip: "Manage patient appointments" },
  { to: "/dashboard/availability", icon: Clock, label: "Availability", tooltip: "Set your working hours" },
  { to: "/dashboard/feedback", icon: Star, label: "Feedback", tooltip: "Patient reviews and feedback" },
  { to: "/dashboard/vitals", icon: Activity, label: "Vitals", tooltip: "Monitor patient vital signs" },
  { to: "/dashboard/lab-results", icon: FileText, label: "Lab Results", tooltip: "Review patient lab reports" },
  { to: "/dashboard/documents", icon: Upload, label: "Documents", tooltip: "Manage medical documents" },
  { to: "/dashboard/link-requests", icon: Link, label: "Link Requests", tooltip: "Approve patient link requests" },
  { to: "/dashboard/alerts", icon: AlertTriangle, label: "Alerts", tooltip: "Critical patient notifications" },
  { to: "/dashboard/vault-access", icon: Shield, label: "Vault Access", tooltip: "Access patient health vaults" },
  { to: "/dashboard/clinic", icon: Building2, label: "Clinic", tooltip: "Clinic settings and management" },
  { to: "/dashboard/compliance", icon: ClipboardCheck, label: "Compliance", tooltip: "View patient compliance reports" },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { role, signOut, connectedClinics, switchToClinic } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clinicDropdownOpen, setClinicDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const manageableClinics = connectedClinics.filter(
    (c) => c.member_role === "owner" || c.member_role === "admin"
  );

  const onSwitchToClinic = async (clinicId: string) => {
    setSwitching(true);
    setClinicDropdownOpen(false);
    setSidebarOpen(false);
    try {
      const { error } = await switchToClinic(clinicId);
      if (error) {
        toast({ title: "Could not switch to clinic", description: error.message, variant: "destructive" });
      } else {
        navigate("/clinic", { replace: true });
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="min-h-screen pwa-screen flex bg-background w-full max-w-full overflow-x-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 w-64 max-w-[85vw] lg:max-w-none h-[100dvh] lg:h-screen bg-card border-r border-border flex flex-col transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="safe-area-header min-h-[4rem] flex items-center justify-between px-5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-heading font-bold text-foreground truncate">Mediimate</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden touch-target rounded-xl text-muted-foreground hover:bg-muted p-2" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden min-h-0">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to || (item.to !== "/dashboard" && location.pathname.startsWith(item.to));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                title={item.tooltip}
                className={`flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
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

        <div className="p-3 border-t border-border space-y-1 safe-area-bottom flex-shrink-0">
          {role === "doctor" && connectedClinics.length > 0 && (
            <div className="px-3 py-2 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">My Clinics</p>
              {connectedClinics.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                  <span className="truncate flex-1">{c.name}</span>
                  <span className="text-[10px] capitalize text-muted-foreground/60">{c.member_role}</span>
                </div>
              ))}
            </div>
          )}
          {role === "doctor" && manageableClinics.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setClinicDropdownOpen((o) => !o)}
                disabled={switching}
                className="flex items-center justify-between gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <Building2 className="w-5 h-5" />
                  Manage Clinic
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${clinicDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {clinicDropdownOpen && (
                <div className="mt-1 py-1 rounded-lg bg-muted/50 border border-border shadow-lg">
                  {manageableClinics.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSwitchToClinic(c.id)}
                      className="w-full text-left px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground w-full transition-colors touch-manipulation"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-[100dvh] w-full max-w-full overflow-x-hidden">
        <header className="safe-area-header min-h-[3.5rem] sm:min-h-[4rem] border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 flex-shrink-0">
          <div className="flex items-center min-w-0 flex-1">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden touch-target mr-3 text-muted-foreground hover:bg-muted rounded-xl p-2 flex-shrink-0" aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-heading font-semibold text-foreground truncate min-w-0">
              {navItems.find((i) => location.pathname === i.to || (i.to !== "/dashboard" && location.pathname.startsWith(i.to)))?.label || "Dashboard"}
            </h2>
          </div>
          <NotificationCenter />
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto pwa-safe-x min-w-0 safe-area-bottom">
          {children}
        </main>
      </div>
    </div>
  );
}
