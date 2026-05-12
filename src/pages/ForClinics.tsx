import { useState } from "react";
import {
  HeartPulse,
  Menu,
  X,
  MessageSquare,
  Activity,
  BarChart3,
  Shield,
  Calendar,
  Bot,
  Users,
  Stethoscope,
  Zap,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  IndianRupee,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import ContactDialog, { type ContactType } from "@/components/ContactDialog";
import WhatsAppQRSection from "@/components/landing/WhatsAppQRSection";
import AIAgentsFlowSection from "@/components/landing/AIAgentsFlowSection";
import ProgramPlanSection from "@/components/landing/ProgramPlanSection";
import PWAFeaturesSection from "@/components/landing/PWAFeaturesSection";
import DataSecuritySection from "@/components/landing/DataSecuritySection";
import FAQSection from "@/components/landing/FAQSection";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#programs", label: "Programs" },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Pricing" },
];

const Navbar = ({ onContact }: { onContact: (type: ContactType) => void }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b">
      <div className="container mx-auto flex items-center justify-between h-14 sm:h-16 px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <HeartPulse className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg sm:text-xl font-heading font-bold text-foreground">Mediimate</span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">{l.label}</a>
          ))}
          <Link to="/for-hospitals" className="hover:text-foreground transition-colors">For Hospitals</Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/auth/doctor" className="hidden sm:inline-flex text-sm font-medium text-foreground hover:text-primary transition-colors">Doctor Login</Link>
          <button onClick={() => onContact("free_trial")} className="hidden xs:inline-flex px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            Start Free Trial
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors touch-manipulation" aria-label="Toggle menu">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card/95 backdrop-blur-lg px-4 py-3 space-y-1">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors touch-manipulation">{l.label}</a>
          ))}
          <Link to="/for-hospitals" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors touch-manipulation">For Hospitals</Link>
          <div className="flex items-center gap-3 pt-2 border-t border-border/50 mt-2">
            <Link to="/auth/doctor" className="flex-1 text-center px-3 py-2.5 rounded-lg text-sm font-medium text-foreground border border-border hover:bg-muted transition-colors">Doctor Login</Link>
            <button onClick={() => { onContact("free_trial"); setMobileOpen(false); }} className="flex-1 px-3 py-2.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Free Trial</button>
          </div>
        </div>
      )}
    </nav>
  );
};

const HeroSection = ({ onContact }: { onContact: (type: ContactType) => void }) => (
  <section className="pt-24 sm:pt-32 pb-12 sm:pb-20 px-4">
    <div className="container mx-auto max-w-4xl text-center space-y-6 animate-fade-up">
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-sm font-medium text-primary border border-primary/20">
        <Zap className="w-3.5 h-3.5" />
        For Clinics & Practices
      </span>
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-extrabold leading-tight text-foreground">
        Automation that <span className="text-gradient">grows your clinic revenue</span>
      </h1>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        No manual follow-ups. No missed reminders. No revenue leaks. Our platform handles patient engagement,
        care programs, and scheduling on WhatsApp — turning every patient into recurring revenue.
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <button onClick={() => onContact("free_trial")} className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/25">
          Start Free Trial
        </button>
        <button onClick={() => onContact("demo")} className="px-6 py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-muted transition-colors">
          Book a Demo
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> 14-day free trial</span>
        <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> No credit card</span>
        <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Setup in 10 min</span>
      </div>
    </div>
  </section>
);

const stats = [
  { value: "₹12L+", label: "Monthly revenue boost" },
  { value: "65%", label: "Fewer no-shows" },
  { value: "92%", label: "Program completion rate" },
  { value: "3.5x", label: "More patients, same staff" },
];

const StatsBar = () => (
  <section className="py-12 border-y border-border bg-card">
    <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
      {stats.map((s) => (
        <div key={s.label} className="text-center space-y-1">
          <div className="text-2xl sm:text-3xl font-heading font-extrabold text-gradient">{s.value}</div>
          <div className="text-xs sm:text-sm text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  </section>
);

const features = [
  { icon: MessageSquare, title: "WhatsApp Automation", description: "Handles reminders, 2-way messaging, and booking — no staff effort. Patients reply on WhatsApp, the system handles the rest.", tag: "Core" },
  { icon: Activity, title: "Autonomous Care Programs", description: "Runs NCD management, post-discharge care, and elder-care workflows end-to-end. 90-day programmes with gamification.", tag: "Revenue" },
  { icon: BarChart3, title: "Revenue Analytics", description: "Patient adherence rates, at-risk flags, revenue per program, compliance reports — all automated, real-time.", tag: "Insights" },
  { icon: Shield, title: "Patient Health Vault", description: "Centralized records — appointments, labs, medications, vitals. Secure sharing with vault codes. Auto-organized.", tag: "Secure" },
  { icon: Calendar, title: "Smart Scheduling", description: "Automatically handles appointment reminders, confirmations, rescheduling, and no-show follow-ups via WhatsApp.", tag: "Automated" },
];

const FeaturesSection = () => (
  <section id="features" className="py-12 sm:py-24 px-4">
    <div className="container mx-auto">
      <div className="text-center mb-16 space-y-3">
        <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-foreground">
          Everything you need to grow revenue
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Tools that reduce manual work to zero and maximise patient lifetime value.
        </p>
      </div>
      <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((f) => (
          <div key={f.title} className="group rounded-2xl border border-border bg-card p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-start justify-between mb-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary/60 bg-primary/5 px-2 py-1 rounded-full">{f.tag}</span>
            </div>
            <h4 className="font-heading font-bold text-foreground mb-2">{f.title}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const whoItsFor = [
  { icon: Stethoscope, title: "Solo Practitioners", items: ["Automate follow-ups", "Reduce no-shows by 65%", "Patient engagement on WhatsApp"] },
  { icon: Users, title: "Multi-Specialty Clinics", items: ["Multi-doctor management", "Shared patient records", "Revenue per doctor analytics"] },
  { icon: Bot, title: "Clinic Chains", items: ["White-label option", "Centralized analytics", "Custom care program templates"] },
];

const WhoItsForSection = () => (
  <section className="py-12 sm:py-24 px-4 bg-card">
    <div className="container mx-auto max-w-4xl">
      <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground text-center mb-10">Built for every clinic size</h2>
      <div className="grid sm:grid-cols-3 gap-6">
        {whoItsFor.map((w) => (
          <div key={w.title} className="rounded-2xl border border-border bg-background p-6 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <w.icon className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-heading font-bold text-foreground mb-3">{w.title}</h4>
            <ul className="space-y-2">
              {w.items.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />{item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const testimonials = [
  { quote: "Mediimate's AI agents reduced our no-show rate from 35% to under 12%. Revenue went up 40% in Q1.", name: "Dr. Priya Sharma", role: "Cardiologist, HeartCare Clinic, Mumbai", metric: "40% revenue increase" },
  { quote: "Our diabetic care program runs on autopilot. Patients get daily check-ins, I only step in when AI flags something critical.", name: "Dr. Rajesh Mehta", role: "Endocrinologist, LifeLine Hospital, Delhi", metric: "94% adherence" },
  { quote: "We went from 80 patients to 300+ with the same team. The voice check-in feature alone saved 4 hours daily.", name: "Dr. Ananya Reddy", role: "GP, Wellness First, Bangalore", metric: "3.5x patients" },
];

const TestimonialsSection = () => (
  <section className="py-12 sm:py-24 px-4">
    <div className="container mx-auto">
      <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground text-center mb-10">What doctors say</h2>
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {testimonials.map((t) => (
          <div key={t.name} className="glass-card rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex gap-0.5 mb-4">
                {[1, 2, 3, 4, 5].map((s) => <Star key={s} className="w-4 h-4 fill-accent text-accent" />)}
              </div>
              <p className="text-sm text-foreground leading-relaxed mb-4">"{t.quote}"</p>
            </div>
            <div>
              <span className="inline-block px-2.5 py-1 rounded-full bg-primary/10 text-xs font-semibold text-primary mb-3">{t.metric}</span>
              <p className="text-sm font-heading font-bold text-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.role}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const pricingTiers = [
  { name: "Starter", price: "₹999", period: "/month", desc: "For solo clinics", features: ["5 doctors", "200 patients", "WhatsApp AI", "Reminders", "Health vault"], highlighted: false },
  { name: "Growth", price: "₹4,999", period: "/month", desc: "For growing clinics", features: ["20 doctors", "1,000 patients", "All Starter", "Analytics", "Care programs", "Bulk import"], highlighted: true },
  { name: "Enterprise", price: "Custom", period: "", desc: "For clinic chains", features: ["Unlimited", "5,000+ patients", "Dedicated support", "White-label", "Custom integrations"], highlighted: false },
];

const PricingSection = ({ onContact }: { onContact: (type: ContactType) => void }) => (
  <section id="pricing" className="py-12 sm:py-24 px-4 bg-card">
    <div className="container mx-auto">
      <div className="text-center mb-16 space-y-3">
        <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-foreground">Simple pricing</h2>
        <p className="text-muted-foreground">Every plan pays for itself in the first month.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {pricingTiers.map((t) => (
          <div key={t.name} className={`rounded-2xl p-5 sm:p-8 flex flex-col ${t.highlighted ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/25 md:scale-105" : "glass-card"}`}>
            <h3 className={`text-lg font-heading font-bold ${t.highlighted ? "" : "text-foreground"}`}>{t.name}</h3>
            <div className="mt-2 mb-1"><span className={`text-4xl font-heading font-extrabold ${t.highlighted ? "" : "text-foreground"}`}>{t.price}</span><span className={`text-sm ${t.highlighted ? "opacity-80" : "text-muted-foreground"}`}>{t.period}</span></div>
            <p className={`text-sm mb-6 ${t.highlighted ? "opacity-80" : "text-muted-foreground"}`}>{t.desc}</p>
            <ul className="space-y-2.5 mb-8 flex-1">{t.features.map((f) => (<li key={f} className={`flex items-center gap-2 text-sm ${t.highlighted ? "opacity-90" : "text-muted-foreground"}`}><span className={`w-1.5 h-1.5 rounded-full ${t.highlighted ? "bg-accent" : "bg-primary"}`} />{f}</li>))}</ul>
            <button onClick={() => onContact(t.highlighted ? "free_trial" : "pricing")} className={`w-full py-3 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 ${t.highlighted ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}>
              {t.name === "Enterprise" ? "Contact Sales" : "Start Free Trial"}
            </button>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const CTASection = ({ onContact }: { onContact: (type: ContactType) => void }) => (
  <section className="py-12 sm:py-24 px-4">
    <div className="container mx-auto">
      <div className="relative rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-8 sm:p-14 text-center overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-primary-foreground">Ready to automate & grow?</h2>
          <p className="text-primary-foreground/80 text-lg">Join 127+ clinics using Mediimate to grow revenue on autopilot.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => onContact("free_trial")} className="px-8 py-3 rounded-lg bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity shadow-lg">Start Free Trial</button>
            <button onClick={() => onContact("demo")} className="px-8 py-3 rounded-lg border border-primary-foreground/30 text-primary-foreground font-semibold hover:bg-primary-foreground/10 transition-colors">Book a Demo</button>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-border py-10 px-4">
    <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
      <Link to="/" className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
          <HeartPulse className="w-3.5 h-3.5 text-primary-foreground" />
        </div>
        <span className="font-heading font-bold text-foreground">Mediimate</span>
      </Link>
      <div className="flex gap-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
        <Link to="/for-hospitals" className="hover:text-foreground transition-colors">For Hospitals</Link>
        <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
        <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
      </div>
      <p className="text-xs text-muted-foreground">&copy; 2026 Mediimate</p>
    </div>
  </footer>
);

const ForClinics = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contactType, setContactType] = useState<ContactType>("contact");
  const openContact = (type: ContactType) => { setContactType(type); setDialogOpen(true); };

  return (
    <div className="min-h-screen bg-background">
      <Navbar onContact={openContact} />
      <main>
        <HeroSection onContact={openContact} />
        <StatsBar />
        <FeaturesSection />
        <AIAgentsFlowSection />
        <WhoItsForSection />
        <WhatsAppQRSection />
        <div id="programs"><ProgramPlanSection /></div>
        <PWAFeaturesSection />
        <DataSecuritySection />
        <TestimonialsSection />
        <PricingSection onContact={openContact} />
        <FAQSection />
        <CTASection onContact={openContact} />
      </main>
      <Footer />
      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} type={contactType} />
    </div>
  );
};

export default ForClinics;
