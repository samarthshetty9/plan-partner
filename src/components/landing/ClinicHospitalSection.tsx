import {
  MessageSquare,
  Activity,
  BarChart3,
  Shield,
  Calendar,
  Bot,
  Users,
  CheckCircle2,
  ArrowRight,
  Zap,
  Stethoscope,
} from "lucide-react";
import type { ContactType } from "@/components/ContactDialog";

const clinicFeatures = [
  {
    icon: MessageSquare,
    title: "WhatsApp Automation",
    description:
      "Handles reminders, 2-way messaging, and booking — no staff effort. Patients reply on WhatsApp, the system handles the rest.",
    tag: "Zero Manual Work",
  },
  {
    icon: Activity,
    title: "Autonomous Care Programs",
    description:
      "Runs NCD management, post-discharge care, and elder-care workflows end-to-end, automatically.",
    tag: "Automated",
  },
  {
    icon: BarChart3,
    title: "Clinic Analytics",
    description:
      "Patient adherence rates, at-risk flags, revenue insights, and compliance reports — all automated.",
    tag: "Insights",
  },
  {
    icon: Shield,
    title: "Patient Health Vault",
    description:
      "Centralized records — appointments, labs, medications, vitals — auto-organized. Secure sharing with vault codes.",
    tag: "Secure",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description:
      "Automatically handles appointment reminders, confirmations, rescheduling, and no-show follow-ups via WhatsApp.",
    tag: "Scheduling",
  },
];

const clinicStats = [
  { value: "92%", label: "Patient adherence rate" },
  { value: "127+", label: "Clinics onboarded" },
  { value: "30%", label: "No-show reduction" },
  { value: "₹12L+", label: "Monthly revenue boost" },
];

const whoItsFor = [
  {
    icon: Stethoscope,
    title: "Solo Practitioners",
    items: ["Automate follow-ups", "Reduce no-shows", "Patient engagement on WhatsApp"],
  },
  {
    icon: Users,
    title: "Multi-Specialty Clinics",
    items: ["Multi-doctor management", "Shared patient records", "Care program templates"],
  },
  {
    icon: Bot,
    title: "Hospitals & Chains",
    items: ["White-label option", "Custom integrations", "Advanced reporting & analytics"],
  },
];

const ClinicHospitalSection = ({ onContact }: { onContact: (type: ContactType) => void }) => (
  <section id="for-clinics" className="py-12 sm:py-24 px-4 bg-card">
    <div className="container mx-auto">
      {/* Section Header */}
      <div className="text-center mb-12 sm:mb-20 space-y-4">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-sm font-semibold text-primary border border-primary/20">
          <Zap className="w-4 h-4" />
          For Clinics & Hospitals
        </span>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-extrabold text-foreground">
          automation that <span className="text-gradient">runs your clinic</span>
        </h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          No manual follow-ups, no missed reminders. Our platform handles patient engagement,
          care programs, and scheduling — zero staff effort required.
        </p>
      </div>

      {/* Stats */}
      <div className="max-w-4xl mx-auto mb-16 sm:mb-20">
        <div className="rounded-2xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border border-primary/20 p-6 sm:p-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {clinicStats.map((s) => (
              <div key={s.label}>
                <p className="text-2xl sm:text-3xl font-heading font-extrabold text-primary">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-6xl mx-auto mb-16 sm:mb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {clinicFeatures.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-border bg-background p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex items-start justify-between mb-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary/60 bg-primary/5 px-2 py-1 rounded-full">
                  {f.tag}
                </span>
              </div>
              <h4 className="font-heading font-bold text-foreground mb-2">{f.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Who it's for */}
      <div className="max-w-4xl mx-auto mb-16 sm:mb-20">
        <h3 className="text-2xl font-heading font-bold text-foreground text-center mb-10">
          Built for every healthcare practice
        </h3>
        <div className="grid sm:grid-cols-3 gap-6">
          {whoItsFor.map((w) => (
            <div key={w.title} className="rounded-2xl border border-border bg-background p-6 text-center hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <w.icon className="w-6 h-6 text-primary" />
              </div>
              <h4 className="font-heading font-bold text-foreground mb-3">{w.title}</h4>
              <ul className="space-y-2">
                {w.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-blue-500/5 to-indigo-500/10 border border-primary/20 p-8 sm:p-10 text-center">
          <h3 className="text-2xl sm:text-3xl font-heading font-extrabold text-foreground mb-3">
            Ready to automate your clinic?
          </h3>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Join 127+ clinics using Mediimate to reduce no-shows, improve adherence, and grow revenue through WhatsApp.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => onContact("free_trial")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
            >
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onContact("demo")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-muted transition-colors"
            >
              Book a Demo
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-primary" /> 14-day free trial</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-primary" /> No credit card</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Setup in 10 mins</span>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default ClinicHospitalSection;
