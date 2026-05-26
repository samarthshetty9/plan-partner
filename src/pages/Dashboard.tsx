import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import { Users, Layers, Activity, AlertTriangle, TrendingUp, CalendarDays, Building2, Plus, ArrowRight, Copy, Check, Download, Share2, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Stats {
  totalPatients: number;
  activePrograms: number;
  activeEnrollments: number;
  atRiskPatients: number;
}

interface Enrollment {
  enrolled_at: string;
  adherence_pct: number | null;
  status: string;
  program_id: string;
}

interface Program {
  id: string;
  name: string;
  type: string;
}

interface Appointment {
  scheduled_at: string;
  status: string;
}

const CHART_COLORS = [
  "hsl(168, 80%, 30%)",  // primary
  "hsl(24, 95%, 54%)",   // accent
  "hsl(142, 70%, 45%)",  // whatsapp
  "hsl(200, 70%, 50%)",  // blue
  "hsl(280, 60%, 50%)",  // purple
];

const Dashboard = () => {
  const { user, session, connectedClinics } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: async () => {
      const [patientsCount, progs, enrolls, atRiskCount, appts] = await Promise.all([
        api.get<{ count: number }>("patients", { count: "true" }),
        api.get<Program[]>("doctor/programs"),
        api.get<Enrollment[]>("enrollments"),
        api.get<{ count: number }>("patients", { status: "at_risk", count: "true" }),
        api.get<Appointment[]>("appointments"),
      ]);
      const activeEnrolls = (enrolls || []).filter((e) => e.status === "active");
      return {
        stats: {
          totalPatients: (patientsCount as { count?: number })?.count ?? 0,
          activePrograms: (progs || []).length,
          activeEnrollments: activeEnrolls.length,
          atRiskPatients: (atRiskCount as { count?: number })?.count ?? 0,
        },
        programs: progs || [],
        enrollments: enrolls || [],
        appointments: appts || [],
      };
    },
    enabled: !!user,
  });

  const hasClinic = connectedClinics.length > 0;
  const clinicNames = connectedClinics.map((c) => c.name).join(", ");
  const stats = data?.stats ?? { totalPatients: 0, activePrograms: 0, activeEnrollments: 0, atRiskPatients: 0 };
  const enrollments = data?.enrollments ?? [];
  const programs = data?.programs ?? [];
  const appointments = data?.appointments ?? [];
  const loading = isLoading;

  // --- Chart Data ---

  // Enrollment growth over time (last 6 months)
  const enrollmentGrowth = (() => {
    const now = new Date();
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("en", { month: "short", year: "2-digit" });
      const count = enrollments.filter((e) => {
        const ed = new Date(e.enrolled_at);
        return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear();
      }).length;
      months.push({ label, count });
    }
    return months;
  })();

  // Adherence distribution
  const adherenceDistribution = (() => {
    const buckets = [
      { name: "0–25%", min: 0, max: 25, count: 0 },
      { name: "26–50%", min: 26, max: 50, count: 0 },
      { name: "51–75%", min: 51, max: 75, count: 0 },
      { name: "76–100%", min: 76, max: 100, count: 0 },
    ];
    enrollments.forEach((e) => {
      const val = e.adherence_pct ?? 0;
      const bucket = buckets.find((b) => val >= b.min && val <= b.max);
      if (bucket) bucket.count++;
    });
    return buckets;
  })();

  // Program performance (enrollments per program)
  const programPerformance = programs.map((p) => {
    const progEnrollments = enrollments.filter((e) => e.program_id === p.id);
    const avgAdherence = progEnrollments.length > 0
      ? Math.round(progEnrollments.reduce((sum, e) => sum + (e.adherence_pct ?? 0), 0) / progEnrollments.length)
      : 0;
    return { name: p.name.length > 15 ? p.name.slice(0, 15) + "…" : p.name, enrolled: progEnrollments.length, avgAdherence };
  });

  // Enrollment status breakdown for pie chart
  const statusBreakdown = (() => {
    const map: Record<string, number> = {};
    enrollments.forEach((e) => { map[e.status] = (map[e.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  })();

  // Upcoming appointments (next 7 days)
  const upcomingCount = appointments.filter((a) => {
    const d = new Date(a.scheduled_at);
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86400000);
    return d >= now && d <= week && a.status === "scheduled";
  }).length;

  const cards = [
    { label: "Total Patients", value: stats.totalPatients, icon: Users, color: "text-primary", to: "/dashboard/patients" },
    { label: "Active Programs", value: stats.activePrograms, icon: Layers, color: "text-accent", to: "/dashboard/programs" },
    { label: "Active Enrollments", value: stats.activeEnrollments, icon: Activity, color: "text-whatsapp", to: "/dashboard/enrollments" },
    { label: "At-Risk Patients", value: stats.atRiskPatients, icon: AlertTriangle, color: "text-destructive", to: "/dashboard/patients?status=at_risk" },
    { label: "Upcoming (7d)", value: upcomingCount, icon: CalendarDays, color: "text-primary", to: "/dashboard/appointments" },
    { label: "Avg. Adherence", value: enrollments.length > 0 ? Math.round(enrollments.reduce((s, e) => s + (e.adherence_pct ?? 0), 0) / enrollments.length) + "%" : "—", icon: TrendingUp, color: "text-whatsapp", to: "/dashboard/enrollments" },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  const hasData = enrollments.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          {clinicNames ? `Welcome back, Doctor` : "Welcome back, Doctor"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Here's your practice overview</p>
      </div>

      {/* Connected Clinics */}
      {connectedClinics.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="font-heading font-semibold text-foreground text-sm">Connected Clinics</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {connectedClinics.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                <Building2 className="w-3 h-3" />
                {c.name}
                <span className="text-primary/60 capitalize">({c.member_role})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Clinic Setup Prompt */}
      {!hasClinic && (
        <div className="glass-card rounded-xl p-5 border-2 border-dashed border-primary/30 bg-primary/5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-heading font-semibold text-foreground">Set Up Your Clinic</h3>
              <p className="text-sm text-muted-foreground">Create a clinic to manage your team, or join an existing one with an invite code.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button onClick={() => navigate("/clinic-setup")} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> Create
              </button>
              <button onClick={() => navigate("/join-clinic")} className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground font-semibold text-sm hover:bg-muted/80 transition-colors">
                Join <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctor code (share with patients) */}
      {user?.id && <DoctorCodeCard userId={user.id} sessionCode={session?.profile?.doctor_code} />}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} className="glass-card rounded-xl p-3 sm:p-4 space-y-1.5 sm:space-y-2 hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer block">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs text-muted-foreground">{card.label}</span>
              <card.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${card.color}`} />
            </div>
            <div className="text-xl sm:text-2xl font-heading font-bold text-foreground">{card.value}</div>
          </Link>
        ))}
      </div>

      {!hasData ? (
        <div className="glass-card rounded-xl p-6">
          <h3 className="font-heading font-semibold text-foreground mb-3">Getting Started</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> Add your first patients from the Patients tab</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent" /> Create care programs (NCD, Post-Discharge, Elder-Care)</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-whatsapp" /> Enroll patients into programs to track adherence</li>
          </ul>
        </div>
      ) : (
        <>
          {/* Row 1: Enrollment Growth + Adherence Distribution */}
          <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
            {/* Enrollment Growth */}
            <div className="glass-card rounded-xl p-4 sm:p-5">
              <h3 className="font-heading font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">Enrollment Growth</h3>
              <div className="h-48 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={enrollmentGrowth}>
                    <defs>
                      <linearGradient id="enrollGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(168, 80%, 30%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(168, 80%, 30%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(160, 15%, 88%)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "hsl(180, 8%, 46%)" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(180, 8%, 46%)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(160, 15%, 88%)", fontSize: 13 }} />
                    <Area type="monotone" dataKey="count" stroke="hsl(168, 80%, 30%)" strokeWidth={2} fill="url(#enrollGradient)" name="Enrollments" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Adherence Distribution */}
            <div className="glass-card rounded-xl p-4 sm:p-5">
              <h3 className="font-heading font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">Adherence Distribution</h3>
              <div className="h-48 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adherenceDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(160, 15%, 88%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(180, 8%, 46%)" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(180, 8%, 46%)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(160, 15%, 88%)", fontSize: 13 }} />
                    <Bar dataKey="count" name="Patients" radius={[6, 6, 0, 0]}>
                      {adherenceDistribution.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Row 2: Program Performance + Status Breakdown */}
          <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
            {/* Program Performance */}
            <div className="md:col-span-2 glass-card rounded-xl p-4 sm:p-5">
              <h3 className="font-heading font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">Program Performance</h3>
              {programPerformance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No programs yet.</p>
              ) : (
                <div className="h-48 sm:h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={programPerformance} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(160, 15%, 88%)" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(180, 8%, 46%)" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "hsl(180, 8%, 46%)" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(160, 15%, 88%)", fontSize: 13 }} />
                      <Bar dataKey="enrolled" name="Enrolled" fill="hsl(168, 80%, 30%)" radius={[0, 6, 6, 0]} barSize={20} />
                      <Bar dataKey="avgAdherence" name="Avg Adherence %" fill="hsl(24, 95%, 54%)" radius={[0, 6, 6, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Enrollment Status Pie */}
            <div className="glass-card rounded-xl p-5">
              <h3 className="font-heading font-semibold text-foreground mb-4">Enrollment Status</h3>
              {statusBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <div className="h-52 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {statusBreakdown.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(160, 15%, 88%)", fontSize: 13 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

function DoctorCodeCard({ userId, sessionCode }: { userId?: string; sessionCode?: string | null }) {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (typeof sessionCode === "string" && sessionCode !== "") {
      setCode(sessionCode);
      return;
    }
    if (!userId) return;
    setCode(undefined);
    api.get<{ doctor_code?: string }[]>("profiles", { user_id: userId }).then((data) => {
      setCode(data?.[0]?.doctor_code ?? null);
    }).catch(() => setCode(null));
  }, [userId, sessionCode]);

  if (code === undefined) {
    return (
      <div className="glass-card rounded-xl p-5 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-muted shrink-0" />
          <div className="flex-1 space-y-2"><div className="h-4 w-32 bg-muted rounded" /><div className="h-3 w-48 bg-muted rounded" /></div>
        </div>
      </div>
    );
  }
  if (!code) return null;

  const connectUrl = `${window.location.origin}/connect/${code}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(connectUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById("doctor-qr-svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = 512;
      canvas.height = 512;
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 512, 512);
        ctx.drawImage(img, 0, 0, 512, 512);
      }
      const pngUrl = canvas.toDataURL("image/png");
      const dl = document.createElement("a");
      dl.href = pngUrl;
      dl.download = `doctor-qr-${code}.png`;
      dl.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Connect with your Doctor", text: `Scan or visit this link to connect: ${connectUrl}`, url: connectUrl });
      } catch { /* user cancelled */ }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="glass-card rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <QrCode className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-foreground text-sm">Your Doctor QR Code</h3>
          <p className="text-xs text-muted-foreground">Patients scan this QR code to instantly connect with you</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-lg sm:text-xl font-heading font-bold tracking-widest text-primary bg-primary/10 px-3 sm:px-4 py-2 rounded-lg">{code}</code>
          <button onClick={handleCopyCode} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" title="Copy code">
            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={() => setShowQR(!showQR)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors w-full sm:w-auto justify-center"
        >
          <QrCode className="w-4 h-4" />
          {showQR ? "Hide QR Code" : "Show QR Code"}
        </button>
        <button onClick={handleShare} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors w-full sm:w-auto justify-center">
          <Share2 className="w-4 h-4" />
          Share Link
        </button>
        <button onClick={handleCopyLink} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors w-full sm:w-auto justify-center">
          <Copy className="w-4 h-4" />
          Copy Link
        </button>
      </div>

      {showQR && (
        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-border">
            <QRCodeSVG
              id="doctor-qr-svg"
              value={connectUrl}
              size={200}
              level="H"
              includeMargin
              bgColor="#ffffff"
              fgColor="#1a1a1a"
            />
          </div>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Patients can scan this QR code with their phone camera to instantly connect with you
          </p>
          <button onClick={handleDownloadQR} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            <Download className="w-4 h-4" />
            Download QR Code
          </button>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
