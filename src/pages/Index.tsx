import { useState } from "react";
import {
  HeartPulse,
  Menu,
  X,
  Zap,
  Building2,
  ArrowRight,
  TrendingUp,
  IndianRupee,
  Users,
  Shield,
  CheckCircle2,
  BarChart3,
  Plane,
  MessageSquare,
  Star,
} from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-illustration.png";
import ContactDialog, { type ContactType } from "@/components/ContactDialog";
import BackedBySection from "@/components/landing/BackedBySection";
import DataSecuritySection from "@/components/landing/DataSecuritySection";

const NAV_LINKS = [
  { href: "/for-clinics", label: "For Clinics", isRoute: true },
  { href: "/for-hospitals", label: "For Hospitals", isRoute: true },
  { href: "#how-it-works", label: "How It Works", isRoute: false },
  { href: "/contact", label: "About", isRoute: true },
  { href: "#pricing", label: "Pricing", isRoute: false },
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
          <span className="text-lg sm:text-xl font-heading font-bold text-foreground">
            Mediimate
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          {NAV_LINKS.map((l) =>
            l.isRoute ? (
              <Link key={l.href} to={l.href} className="hover:text-foreground transition-colors">
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">
                {l.label}
              </a>
            ),
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/auth" className="hidden sm:inline-flex text-sm font-medium text-foreground hover:text-primary transition-colors">
            Log In
          </Link>
          <button onClick={() => onContact("free_trial")} className="hidden xs:inline-flex px-3 sm:px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            Get Started
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors touch-manipulation" aria-label="Toggle menu">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card/95 backdrop-blur-lg px-4 py-3 space-y-1">
          {NAV_LINKS.map((l) =>
            l.isRoute ? (
              <Link key={l.href} to={l.href} onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors touch-manipulation">
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors touch-manipulation">
                {l.label}
              </a>
            ),
          )}
          <div className="flex items-center gap-3 pt-2 border-t border-border/50 mt-2">
            <Link to="/auth" className="flex-1 text-center px-3 py-2.5 rounded-lg text-sm font-medium text-foreground border border-border hover:bg-muted transition-colors">
              Log In
            </Link>
            <button onClick={() => { onContact("free_trial"); setMobileOpen(false); }} className="flex-1 px-3 py-2.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              Get Started
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

const HeroSection = ({ onContact }: { onContact: (type: ContactType) => void }) => (
  <section className="pt-24 sm:pt-32 pb-12 sm:pb-20 px-4 overflow-hidden">
    <div className="container mx-auto grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
      <div className="space-y-6 animate-fade-up">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-sm font-medium text-primary border border-primary/20">
          <TrendingUp className="w-3.5 h-3.5" />
          Premium Healthcare Platform
        </span>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-extrabold leading-tight text-foreground">
          The <span className="text-gradient">revenue engine</span> for healthcare
        </h1>
        <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
          Mediimate helps clinics and hospitals grow revenue through automated patient engagement,
          automated care programs, and medical tourism patient acquisition.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          <Link to="/for-clinics" className="flex items-center gap-3 px-5 py-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors group">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">For Clinics</p>
              <p className="text-xs text-muted-foreground">Automated engagement & revenue</p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link to="/for-hospitals" className="flex items-center gap-3 px-5 py-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors group">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">For Hospitals</p>
              <p className="text-xs text-muted-foreground">Medical tourism & patients</p>
            </div>
            <ArrowRight className="w-4 h-4 text-emerald-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
      <div className="relative animate-fade-in" style={{ animationDelay: "0.3s" }}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/10 rounded-3xl blur-3xl -z-10" />
        <img src={heroImage} alt="Mediimate healthcare revenue platform" className="w-full rounded-2xl shadow-2xl animate-float" />
      </div>
    </div>
  </section>
);

const revenueStats = [
  { value: "₹12L+", label: "Avg monthly revenue boost per clinic", icon: IndianRupee },
  { value: "127+", label: "Clinics & hospitals onboarded", icon: Building2 },
  { value: "3.5x", label: "More patients with same staff", icon: Users },
  { value: "92%", label: "Patient program completion rate", icon: BarChart3 },
];

const StatsSection = () => (
  <section className="py-16 border-y border-border bg-card">
    <div className="container mx-auto px-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {revenueStats.map((s) => (
          <div key={s.label} className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
              <s.icon className="w-5 h-5 text-primary" />
            </div>
            <div className="text-2xl sm:text-3xl font-heading font-extrabold text-gradient">{s.value}</div>
            <div className="text-xs sm:text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const TwoPathsSection = () => (
  <section id="how-it-works" className="py-12 sm:py-24 px-4">
    <div className="container mx-auto">
      <div className="text-center mb-12 sm:mb-16 space-y-3">
        <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-foreground">
          Two powerful revenue engines
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Whether you're a clinic looking to maximize patient lifetime value, or a hospital seeking
          medical tourism patients — Mediimate drives measurable revenue growth.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
        {/* Clinics Card */}
        <div className="group rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-blue-500/5 p-6 sm:p-8 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
              <Zap className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-xl font-heading font-extrabold text-foreground">For Clinics</h3>
              <p className="text-xs text-primary font-semibold">Automated Patient Engagement</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            Turn every patient visit into recurring revenue. WhatsApp automation handles follow-ups,
            care programs, and reminders — reducing no-shows by 65% and increasing adherence to 92%.
          </p>
          <ul className="space-y-2 mb-6">
            {[
              "WhatsApp automation — zero manual work",
              "90-day care programs with gamification",
              "Automated reminders & follow-ups",
              "Patient health vault & document management",
              "Revenue analytics & compliance reports",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 mb-4">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary">₹12L+ monthly revenue boost</span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary">65% fewer no-shows</span>
          </div>
          <Link to="/for-clinics" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline group-hover:gap-3 transition-all">
            Explore Clinic Solution <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Hospitals Card */}
        <div className="group rounded-2xl border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 p-6 sm:p-8 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-heading font-extrabold text-foreground">For Hospitals</h3>
              <p className="text-xs text-emerald-600 font-semibold">Medical Tourism & Patient Acquisition</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            Get a steady stream of verified, pre-qualified patients from India and abroad.
            Mediimate handles patient sourcing, case management, and end-to-end coordination.
          </p>
          <ul className="space-y-2 mb-6">
            {[
              "Pre-qualified patient leads with medical reports",
              "Fixed-price quoting & treatment packaging",
              "International patient coordination & visa support",
              "Case management dashboard for your team",
              "Post-treatment follow-up & patient retention",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 mb-4">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700">60–80% cost savings for patients</span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700">12+ verified hospitals</span>
          </div>
          <Link to="/for-hospitals" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 hover:underline group-hover:gap-3 transition-all">
            Explore Hospital Solution <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  </section>
);

const testimonials = [
  {
    quote: "Mediimate's AI agents reduced our no-show rate from 35% to under 12%. Revenue went up 40% in the first quarter.",
    name: "Dr. Priya Sharma",
    role: "Cardiologist, HeartCare Clinic, Mumbai",
    metric: "40% revenue increase",
    type: "clinic",
  },
  {
    quote: "We get 20+ pre-qualified international patient leads every month. The case management system makes coordination seamless.",
    name: "Dr. Vikram Nair",
    role: "COO, Narayana Health, Bangalore",
    metric: "20+ leads/month",
    type: "hospital",
  },
  {
    quote: "We went from 80 patients to 300+ with the same staff. The AI handles everything — we just focus on treating patients.",
    name: "Dr. Ananya Reddy",
    role: "General Physician, Wellness First, Bangalore",
    metric: "3.5x more patients",
    type: "clinic",
  },
];

const TestimonialsSection = () => (
  <section className="py-12 sm:py-24 px-4">
    <div className="container mx-auto">
      <div className="text-center mb-16 space-y-3">
        <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-foreground">
          Trusted by clinics & hospitals
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Real results from healthcare providers using Mediimate.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {testimonials.map((t) => (
          <div key={t.name} className="glass-card rounded-2xl p-6 flex flex-col justify-between hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div>
              <div className="flex gap-0.5 mb-4">
                {[1, 2, 3, 4, 5].map((s) => <Star key={s} className="w-4 h-4 fill-accent text-accent" />)}
              </div>
              <p className="text-sm text-foreground leading-relaxed mb-4">"{t.quote}"</p>
            </div>
            <div>
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold mb-3 ${t.type === "clinic" ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-700"}`}>
                {t.metric}
              </span>
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
  {
    name: "Starter",
    price: "₹999",
    period: "/month",
    description: "For solo clinics getting started",
    features: ["Up to 5 doctors", "200 patients", "WhatsApp AI agent", "Appointment reminders", "Health vault"],
    highlighted: false,
    cta: "free_trial" as ContactType,
    label: "Start Free Trial",
  },
  {
    name: "Growth",
    price: "₹4,999",
    period: "/month",
    description: "For growing multi-specialty clinics",
    features: ["Up to 20 doctors", "1,000 patients", "All Starter features", "Care programs & analytics", "Bulk import & templates"],
    highlighted: true,
    cta: "free_trial" as ContactType,
    label: "Start Free Trial",
  },
  {
    name: "Hospital",
    price: "Custom",
    period: "",
    description: "For hospitals & medical tourism",
    features: ["Unlimited doctors", "Patient acquisition pipeline", "Medical tourism dashboard", "International patient support", "White-label & integrations"],
    highlighted: false,
    cta: "pricing" as ContactType,
    label: "Contact Sales",
  },
];

const PricingSection = ({ onContact }: { onContact: (type: ContactType) => void }) => (
  <section id="pricing" className="py-12 sm:py-24 px-4 bg-card">
    <div className="container mx-auto">
      <div className="text-center mb-16 space-y-3">
        <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-foreground">
          Plans that grow with you
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Start small, scale as your revenue grows. Every plan pays for itself.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {pricingTiers.map((tier) => (
          <div key={tier.name} className={`rounded-2xl p-5 sm:p-8 flex flex-col ${tier.highlighted ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/25 md:scale-105" : "glass-card"}`}>
            <h3 className={`text-lg font-heading font-bold ${tier.highlighted ? "" : "text-foreground"}`}>{tier.name}</h3>
            <div className="mt-2 mb-1">
              <span className={`text-4xl font-heading font-extrabold ${tier.highlighted ? "" : "text-foreground"}`}>{tier.price}</span>
              <span className={`text-sm ${tier.highlighted ? "opacity-80" : "text-muted-foreground"}`}>{tier.period}</span>
            </div>
            <p className={`text-sm mb-6 ${tier.highlighted ? "opacity-80" : "text-muted-foreground"}`}>{tier.description}</p>
            <ul className="space-y-2.5 mb-8 flex-1">
              {tier.features.map((f) => (
                <li key={f} className={`flex items-center gap-2 text-sm ${tier.highlighted ? "opacity-90" : "text-muted-foreground"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${tier.highlighted ? "bg-accent" : "bg-primary"}`} />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={() => onContact(tier.cta)} className={`w-full py-3 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 ${tier.highlighted ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground"}`}>
              {tier.label}
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
      <div className="relative rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-6 sm:p-12 md:p-20 text-center overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-primary-foreground">
            Ready to grow your revenue?
          </h2>
          <p className="text-primary-foreground/80 text-lg">
            Join 127+ clinics and hospitals using Mediimate as their revenue growth engine.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={() => onContact("free_trial")} className="px-8 py-3 rounded-lg bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity shadow-lg">
              I'm a Clinic
            </button>
            <button onClick={() => onContact("demo")} className="px-8 py-3 rounded-lg border border-primary-foreground/30 text-primary-foreground font-semibold hover:bg-primary-foreground/10 transition-colors">
              I'm a Hospital
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-border py-12 px-4">
    <div className="container mx-auto">
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <HeartPulse className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-foreground">Mediimate</span>
          </div>
          <p className="text-sm text-muted-foreground">
            The premium revenue generation engine for healthcare.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">For Clinics</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <Link to="/for-clinics" className="block hover:text-foreground transition-colors">Clinic Solution</Link>
            <Link to="/auth/doctor" className="block hover:text-foreground transition-colors">Doctor Login</Link>
            <a href="#pricing" className="block hover:text-foreground transition-colors">Pricing</a>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">For Hospitals</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <Link to="/for-hospitals" className="block hover:text-foreground transition-colors">Hospital Solution</Link>
            <Link to="/auth/patient" className="block hover:text-foreground transition-colors">Patient Portal</Link>
            <Link to="/contact" className="block hover:text-foreground transition-colors">Contact Sales</Link>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Company</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <Link to="/contact" className="block hover:text-foreground transition-colors">About</Link>
            <Link to="/contact" className="block hover:text-foreground transition-colors">Contact</Link>
            <Link to="/privacy" className="block hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="block hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-border pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
        <p className="text-xs text-muted-foreground">&copy; 2026 Mediimate. All rights reserved.</p>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
        </div>
      </div>
    </div>
  </footer>
);

const Index = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contactType, setContactType] = useState<ContactType>("contact");

  const openContact = (type: ContactType) => {
    setContactType(type);
    setDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar onContact={openContact} />
      <main>
        <HeroSection onContact={openContact} />
        <StatsSection />
        <TwoPathsSection />
        <DataSecuritySection />
        <BackedBySection />
        <TestimonialsSection />
        <PricingSection onContact={openContact} />
        <CTASection onContact={openContact} />
      </main>
      <Footer />
      <ContactDialog open={dialogOpen} onOpenChange={setDialogOpen} type={contactType} />
    </div>
  );
};

export default Index;
