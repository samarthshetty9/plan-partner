import { MessageSquare, Bot, Bell, BarChart3, ArrowRight, Zap } from "lucide-react";

const flowSteps = [
  {
    icon: MessageSquare,
    label: "Patient sends a WhatsApp message",
    sublabel: "\"I ate 2 rotis, dal, rice\"",
    color: "bg-[hsl(var(--whatsapp))]",
  },
  {
    icon: Bot,
    label: "Smart engine processes & responds",
    sublabel: "Parses food, logs vitals, answers queries",
    color: "bg-primary",
  },
  {
    icon: Zap,
    label: "Automated actions triggered",
    sublabel: "Alerts, follow-ups, escalations — instantly",
    color: "bg-accent",
  },
  {
    icon: BarChart3,
    label: "Doctor sees real-time insights",
    sublabel: "Dashboard updates, no manual data entry",
    color: "bg-primary",
  },
];

const automations = [
  { icon: Bell, title: "Appointment Reminders", desc: "Automatically sends confirm/reschedule via WhatsApp 24h before" },
  { icon: Bot, title: "Care Program Follow-ups", desc: "Daily/weekly automated check-ins per care plan" },
  { icon: Zap, title: "Smart Escalation", desc: "Flags critical readings and notifies doctor instantly" },
];

const AIAgentsFlowSection = () => (
  <section className="py-12 sm:py-24 px-4 bg-card border-y border-border overflow-hidden">
    <div className="container mx-auto">
      <div className="text-center mb-16 space-y-3 animate-fade-up">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-sm font-medium text-accent border border-accent/20">
          <Bot className="w-3.5 h-3.5" />
          Fully Autonomous
        </span>
        <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-foreground">
          How your clinic runs on autopilot
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          From the moment a patient sends a message to real-time doctor insights — every step is automated. No staff involvement needed.
        </p>
      </div>

      {/* Visual Flow Diagram */}
      <div className="relative max-w-4xl mx-auto mb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
          {flowSteps.map((step, i) => (
            <div
              key={step.label}
              className="relative flex flex-col items-center text-center group opacity-0 animate-fade-up"
              style={{ animationDelay: `${i * 200}ms`, animationFillMode: "forwards" }}
            >
              {/* Connector arrow */}
              {i > 0 && (
                <div
                  className="hidden lg:flex absolute -left-3 top-8 z-10 opacity-0 animate-fade-in"
                  style={{ animationDelay: `${i * 200 + 100}ms`, animationFillMode: "forwards" }}
                >
                  <ArrowRight className="w-6 h-6 text-primary/50" />
                </div>
              )}
              <div className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <step.icon className="w-7 h-7 text-primary-foreground" />
              </div>
              <h4 className="text-sm font-heading font-bold text-foreground mb-1 leading-snug">
                {step.label}
              </h4>
              <p className="text-xs text-muted-foreground italic">
                {step.sublabel}
              </p>
            </div>
          ))}
        </div>

        {/* Pulsing connector line (desktop only) */}
        <div className="hidden lg:block absolute top-8 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-[hsl(var(--whatsapp))] via-primary to-accent animate-pulse-glow" />
        <div className="hidden lg:block absolute top-[30px] left-[12%] right-[12%] h-1 bg-gradient-to-r from-[hsl(var(--whatsapp)/0.3)] via-primary/30 to-accent/30 rounded-full blur-sm animate-pulse-glow" style={{ animationDelay: "0.5s" }} />
      </div>

      {/* What gets automated */}
      <div className="max-w-4xl mx-auto">
        <h3 className="text-center text-lg font-heading font-bold text-foreground mb-8 animate-fade-up" style={{ animationDelay: "0.6s", animationFillMode: "forwards" }}>
          What runs on autopilot — <span className="text-accent">zero manual work</span>
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {automations.map((item, i) => (
            <div
              key={item.title}
              className="flex items-start gap-4 rounded-xl border border-border bg-background p-5 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 opacity-0 animate-fade-up"
              style={{ animationDelay: `${800 + i * 150}ms`, animationFillMode: "forwards" }}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="text-sm font-heading font-bold text-foreground">{item.title}</h4>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default AIAgentsFlowSection;
