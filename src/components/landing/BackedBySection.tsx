import { Building2, CheckCircle2, Quote } from "lucide-react";

const partners = [
  {
    category: "Incubation",
    logo: "/logos/manipal.png",
    name: "Manipal Incubation Centre (MIC)",
    items: ["Incubated: Mediimate", "Mentors: Manipal Hospital CMOs"],
    accent: "border-blue-500/30 bg-blue-500/5",
    hospitals: null as null,
  },
  {
    category: "Government",
    logo: "/logos/karnataka.svg",
    name: "Government of Karnataka",
    items: [
      "Startup Karnataka portfolio",
      "NPCDCS aligned (Diabetes/HTN programs)",
      "SUAS Bengaluru certified",
      "PHC rollout pilot approved (50 centers)",
    ],
    accent: "border-amber-500/30 bg-amber-500/5",
    hospitals: null as null,
  },
  {
    category: "Clinical Partners",
    logo: null as string | null,
    name: "Hospital Network",
    hospitals: [
      { name: "Apollo Hospitals", logo: "/logos/apollo.svg", note: "Labs + ER linkage" },
      { name: "NIMHANS", logo: "/logos/nimhans.svg", note: "Mental health validation" },
      { name: "KSHEMA", logo: "/logos/kshema.svg", note: "Kannada content certified" },
    ],
    items: [] as string[],
    accent: "border-red-500/30 bg-red-500/5",
  },
];

const BackedBySection = () => (
  <section id="backed-by" className="py-12 sm:py-24 px-4 bg-card">
    <div className="container mx-auto">
      <div className="text-center mb-8 sm:mb-16 space-y-3">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-sm font-medium text-amber-600 border border-amber-500/20">
          <Building2 className="w-3.5 h-3.5" />
          Backed By
        </span>
        <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-foreground">
          Govt-backed. Hospital-trusted.
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Incubated by Manipal, certified by Karnataka government, partnered with India's leading hospitals.
        </p>
      </div>

      {/* Partner detail cards */}
      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
        {partners.map((p) => (
          <div
            key={p.category}
            className={`group rounded-2xl border ${p.accent} bg-background p-5 sm:p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300`}
          >
            {p.logo ? (
              <img src={p.logo} alt={p.name} className="h-10 sm:h-12 w-auto object-contain mb-4" />
            ) : p.hospitals ? (
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {p.hospitals.map((h) => (
                  <img key={h.name} src={h.logo} alt={h.name} className="h-8 sm:h-10 w-auto object-contain" />
                ))}
              </div>
            ) : null}

            <p className="text-xs font-bold text-primary/60 uppercase tracking-wider mb-1">{p.category}</p>
            <h3 className="text-lg font-heading font-bold text-foreground mb-3">{p.name}</h3>

            {p.items.length > 0 && (
              <ul className="space-y-2">
                {p.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}

            {p.hospitals && (
              <ul className="space-y-2">
                {p.hospitals.map((h) => (
                  <li key={h.name} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span><span className="font-medium text-foreground">{h.name}</span> — {h.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Trust quote */}
      <div className="mt-12 max-w-2xl mx-auto text-center">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-amber-500/5 p-6 sm:p-8">
          <Quote className="w-8 h-8 text-primary/30 mx-auto mb-3" />
          <p className="text-lg font-heading font-semibold text-foreground leading-relaxed">
            Govt-backed. Hospital-trusted. 127 clinics live.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Mediimate is the only platform in India with government backing, hospital clinical validation, and a 92% patient completion rate.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default BackedBySection;
