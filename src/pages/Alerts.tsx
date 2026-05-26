import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Bell,
  Heart,
  CalendarX,
  TrendingDown,
  CheckCircle,
  Eye,
  ArrowUpCircle,
  RefreshCw,
  Filter,
} from "lucide-react";
import { format } from "date-fns";

interface Alert {
  id: string;
  doctor_id: string;
  patient_id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  related_id: string | null;
  related_type: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  patients?: { full_name: string } | null;
}

const typeConfig: Record<string, { icon: any; label: string; color: string }> = {
  low_adherence: { icon: TrendingDown, label: "Low Adherence", color: "text-accent" },
  abnormal_vital: { icon: Heart, label: "Abnormal Vital", color: "text-destructive" },
  no_show: { icon: CalendarX, label: "No-Show", color: "text-muted-foreground" },
  missed_medication: { icon: Bell, label: "Missed Medication", color: "text-accent" },
  reminder_escalation: { icon: Bell, label: "Reminder Escalation", color: "text-accent" },
};

const severityColors: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-accent/10 text-accent border-accent/30",
  info: "bg-primary/10 text-primary border-primary/30",
};

const statusColors: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  acknowledged: "bg-accent/10 text-accent",
  resolved: "bg-whatsapp/10 text-whatsapp",
  escalated: "bg-primary/10 text-primary",
};

const Alerts = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");

  const fetchAlerts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterStatus !== "all") params.status = filterStatus;
      if (filterType !== "all") params.alert_type = filterType;
      const data = await api.get<Alert[]>("alerts", params);
      const patientsRes = await api.get<{ items: { id: string; full_name: string }[] }>("patients", { limit: "500", skip: "0" }).catch(() => ({ items: [] }));
      const patientMap: Record<string, string> = {};
      (patientsRes?.items ?? []).forEach((p) => { patientMap[p.id] = p.full_name; });
      setAlerts((data || []).map((a) => ({ ...a, patients: a.patient_id ? { full_name: patientMap[a.patient_id] || "Unknown" } : null })));
    } catch {
      setAlerts([]);
    }
    setLoading(false);
  }, [user, filterType, filterStatus]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    if (!user) return;
    api.post("alerts/scan", {})
      .then(() => {
        fetchAlerts();
      })
      .catch((err) => {
        console.error("Auto-scan on mount failed:", err);
      });
  }, [user]);


  const runScan = async () => {
    setScanning(true);
    try {
      const result = await api.post<{ scanned: boolean; created: number }>("alerts/scan", {});
      toast({ title: "Scan complete", description: `${result.created} new alert(s) found.` });
      fetchAlerts();
    } catch (err) {
      toast({ title: "Scan failed", description: (err as Error).message, variant: "destructive" });
    }
    setScanning(false);
  };

  const updateStatus = async (id: string, status: string, notes?: string) => {
    const update: Record<string, unknown> = { status };
    if (status === "resolved") {
      (update as any).resolved_at = new Date().toISOString();
      (update as any).resolved_by = user?.id;
      if (notes) (update as any).resolution_notes = notes;
    }
    try {
      await api.patch("alerts/" + id, update);
      toast({ title: `Alert ${status}` });
      setResolvingId(null);
      setResolveNotes("");
      fetchAlerts();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  const openCount = alerts.filter((a) => a.status === "open").length;
  const criticalCount = alerts.filter((a) => a.severity === "critical" && a.status === "open").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Alerts & Escalations</h1>
          <p className="text-muted-foreground text-sm">
            {openCount} open alerts{criticalCount > 0 && `, ${criticalCount} critical`}
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning..." : "Run Alert Scan"}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Open Alerts", value: openCount, icon: AlertTriangle, color: "text-destructive" },
          { label: "Critical", value: criticalCount, icon: Heart, color: "text-destructive" },
          {
            label: "Acknowledged",
            value: alerts.filter((a) => a.status === "acknowledged").length,
            icon: Eye,
            color: "text-accent",
          },
          {
            label: "Resolved Today",
            value: alerts.filter(
              (a) =>
                a.status === "resolved" &&
                a.resolved_at &&
                new Date(a.resolved_at).toDateString() === new Date().toDateString()
            ).length,
            icon: CheckCircle,
            color: "text-whatsapp",
          },
        ].map((c) => (
          <div key={c.label} className="glass-card rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className="text-2xl font-heading font-bold text-foreground">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">All Types</option>
          <option value="low_adherence">Low Adherence</option>
          <option value="abnormal_vital">Abnormal Vitals</option>
          <option value="no_show">No-Show</option>
          <option value="missed_medication">Missed Medication</option>
          <option value="reminder_escalation">Reminder Escalation</option>
        </select>
      </div>

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center">
          <CheckCircle className="w-10 h-10 text-whatsapp mx-auto mb-3" />
          <h3 className="font-heading font-semibold text-foreground">All clear!</h3>
          <p className="text-sm text-muted-foreground mt-1">No alerts match your filters. Run a scan to check for new issues.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const config = typeConfig[alert.alert_type] || {
              icon: AlertTriangle,
              label: alert.alert_type,
              color: "text-muted-foreground",
            };
            const Icon = config.icon;

            return (
              <div
                key={alert.id}
                className={`glass-card rounded-xl p-4 border-l-4 ${
                  alert.severity === "critical"
                    ? "border-l-destructive"
                    : alert.severity === "warning"
                    ? "border-l-accent"
                    : "border-l-primary"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        severityColors[alert.severity] || "bg-muted"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm text-foreground">{alert.title}</h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            severityColors[alert.severity] || ""
                          }`}
                        >
                          {alert.severity}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            statusColors[alert.status] || ""
                          }`}
                        >
                          {alert.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>{config.label}</span>
                        <span>•</span>
                        <span>
                          {(alert.patients as any)?.full_name || "Unknown patient"}
                        </span>
                        <span>•</span>
                        <span>{format(new Date(alert.created_at), "MMM d, HH:mm")}</span>
                      </div>
                      {alert.resolution_notes && (
                        <p className="text-xs text-whatsapp mt-1">
                          Resolution: {alert.resolution_notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {alert.status !== "resolved" && (
                    <div className="flex items-center gap-2 shrink-0">
                      {alert.status === "open" && (
                        <button
                          onClick={() => updateStatus(alert.id, "acknowledged")}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          <Eye className="w-3 h-3" /> Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus(alert.id, "escalated")}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-accent/30 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
                      >
                        <ArrowUpCircle className="w-3 h-3" /> Escalate
                      </button>
                      <button
                        onClick={() =>
                          resolvingId === alert.id
                            ? setResolvingId(null)
                            : setResolvingId(alert.id)
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-whatsapp/30 text-xs font-medium text-whatsapp hover:bg-whatsapp/10 transition-colors"
                      >
                        <CheckCircle className="w-3 h-3" /> Resolve
                      </button>
                    </div>
                  )}
                </div>

                {/* Resolve Form */}
                {resolvingId === alert.id && (
                  <div className="mt-3 pt-3 border-t border-border flex gap-2">
                    <input
                      value={resolveNotes}
                      onChange={(e) => setResolveNotes(e.target.value)}
                      placeholder="Resolution notes (optional)..."
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <button
                      onClick={() => updateStatus(alert.id, "resolved", resolveNotes)}
                      className="px-4 py-2 rounded-lg bg-whatsapp text-whatsapp-foreground font-semibold text-sm hover:opacity-90"
                    >
                      Confirm
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Alerts;
