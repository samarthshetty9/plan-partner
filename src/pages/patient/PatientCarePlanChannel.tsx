import { useState, useMemo } from "react";
import { MARKETPLACE_PLANS } from "@/data/marketplace-plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  HeartPulse, 
  Sparkles, 
  ChevronRight, 
  Trophy, 
  Zap, 
  Users, 
  Star,
  ShieldCheck,
  TrendingUp,
  Clock,
  Search,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

const DURATION_FILTERS = [
  { label: "All durations", value: "all" },
  { label: "Up to 30 days", value: "30" },
  { label: "31–60 days", value: "60" },
  { label: "61–90 days", value: "90" },
  { label: "90+ days", value: "90+" },
];

export default function PatientCarePlanChannel() {
  const allCategories = useMemo(
    () => Array.from(new Set(MARKETPLACE_PLANS.map(p => p.category))),
    []
  );
  const allCoaches = useMemo(
    () => Array.from(new Set(MARKETPLACE_PLANS.map(p => p.coach))),
    []
  );

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedDuration, setSelectedDuration] = useState("all");
  const [selectedCoach, setSelectedCoach] = useState("all");

  const filtered = useMemo(() => {
    return MARKETPLACE_PLANS.filter(p => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.coach.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      const matchCategory = selectedCategory === "all" || p.category === selectedCategory;
      const matchCoach = selectedCoach === "all" || p.coach === selectedCoach;
      const matchDuration =
        selectedDuration === "all" ||
        (selectedDuration === "30" && p.duration_days <= 30) ||
        (selectedDuration === "60" && p.duration_days > 30 && p.duration_days <= 60) ||
        (selectedDuration === "90" && p.duration_days > 60 && p.duration_days <= 90) ||
        (selectedDuration === "90+" && p.duration_days > 90);
      return matchSearch && matchCategory && matchCoach && matchDuration;
    });
  }, [search, selectedCategory, selectedDuration, selectedCoach]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, typeof MARKETPLACE_PLANS>();
    filtered.forEach(p => {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    });
    return map;
  }, [filtered]);

  const hasFilters = search || selectedCategory !== "all" || selectedDuration !== "all" || selectedCoach !== "all";

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory("all");
    setSelectedDuration("all");
    setSelectedCoach("all");
  };

  return (
    <div className="space-y-10 pb-20">
      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden bg-slate-900 text-white p-8 md:p-12 shadow-2xl">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/20 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-6">
          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none px-4 py-1 text-xs font-bold uppercase tracking-widest">
            Level Up Your Health
          </Badge>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">
            The Mediimate <span className="text-emerald-400">Channel</span>
          </h1>
          <p className="text-slate-300 text-lg md:text-xl font-medium leading-relaxed">
            Choose from expert-curated care plans. From chronic reversal to peak athletic performance. 
            Join thousands of patients already on their journey.
          </p>
          <div className="flex flex-wrap gap-4 pt-4">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold">12k+ Active Users</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <Star className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold">4.9/5 Rating</span>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filters */}
      <div className="space-y-4 sticky top-0 z-20 bg-background/95 backdrop-blur-sm pt-2 pb-4 -mx-1 px-1">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search plans, categories, or doctors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Category filter */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                selectedCategory === "all"
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-background text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              All categories
            </button>
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? "all" : cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  selectedCategory === cat
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-background text-slate-600 border-slate-200 hover:border-emerald-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Duration filter */}
          <select
            value={selectedDuration}
            onChange={e => setSelectedDuration(e.target.value)}
            className="px-3 py-1 rounded-full text-xs font-semibold border border-slate-200 bg-background text-slate-600 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {DURATION_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Doctor filter */}
          <select
            value={selectedCoach}
            onChange={e => setSelectedCoach(e.target.value)}
            className="px-3 py-1 rounded-full text-xs font-semibold border border-slate-200 bg-background text-slate-600 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All doctors</option>
            {allCoaches.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>

        {/* Results count */}
        {hasFilters && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} plan{filtered.length !== 1 ? "s" : ""} found
          </p>
        )}
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Search className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
          <p className="text-muted-foreground font-medium">No plans match your search.</p>
          <button onClick={clearFilters} className="text-sm text-primary hover:underline">Clear filters</button>
        </div>
      )}

      {/* Categories & Plans */}
      {Array.from(groupedByCategory.entries()).map(([category, plans]) => {
        const coach = plans[0]?.coach;
        const coachRole = plans[0]?.coachRole;

        return (
          <section key={category} className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">{category}</h2>
                <div className="flex items-center gap-2 text-slate-500">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                    <Users className="w-3 h-3" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider">
                    Headed by <span className="text-slate-900">{coach}</span> • {coachRole}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <Link 
                  key={plan.id} 
                  to={`/patient/care-plan/channel/${plan.id}`}
                  className="group block"
                >
                  <Card className="h-full border-slate-200/60 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden relative">
                    <div className="absolute top-4 right-4 z-20">
                      <div className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm border border-slate-100 flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span className="text-[10px] font-black text-slate-700">
                          {plan.price ?? "PREMIUM"}
                        </span>
                      </div>
                    </div>
                    
                    <div className="h-3 w-full" style={{ background: plan.cover_color }} />
                    <CardHeader className="space-y-1 pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg font-black text-slate-800 leading-tight group-hover:text-emerald-600 transition-colors">
                          {plan.name}
                        </CardTitle>
                      </div>
                      <p className="text-xs font-medium text-slate-500 line-clamp-2 leading-relaxed">
                        {plan.description}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {plan.features.slice(0, 2).map((f, i) => (
                          <Badge key={i} variant="secondary" className="bg-slate-50 text-slate-600 text-[10px] font-bold border-none">
                            {f}
                          </Badge>
                        ))}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100 flex flex-col gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter text-nowrap">Duration</p>
                          <p className="text-sm font-black text-slate-800">{plan.duration_days} Days</p>
                        </div>
                        <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100 flex flex-col gap-1">
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter text-nowrap">Rewards</p>
                          <p className="text-sm font-black text-slate-800">Earn MHP</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                         <div className="flex items-center gap-2">
                           <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center ring-2 ring-white shadow-sm overflow-hidden">
                             {plan.coachImage ? (
                                <img src={plan.coachImage} alt={plan.coach} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
                              )}
                           </div>
                           <p className="text-[11px] font-bold text-slate-700">{plan.coach}</p>
                         </div>
                         <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg px-4 h-8 text-xs">
                           Preview
                         </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* Why Mediimate Channel */}
      {filtered.length > 0 && (
        <section className="bg-emerald-50 rounded-3xl p-8 md:p-12 border border-emerald-100 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="space-y-3">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm ring-1 ring-emerald-200">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-black text-slate-800">Verified Protocols</h3>
              <p className="text-sm text-slate-600 font-medium">All plans are clinical-grade and reviewed by senior doctors.</p>
            </div>
            <div className="space-y-3">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm ring-1 ring-emerald-200">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-black text-slate-800">Dynamic Progress</h3>
              <p className="text-sm text-slate-600 font-medium">Auto-adjusting tasks based on your logs and physical performance.</p>
            </div>
            <div className="space-y-3">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm ring-1 ring-emerald-200">
                <Sparkles className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-lg font-black text-slate-800">Earn Rewards</h3>
              <p className="text-sm text-slate-600 font-medium">The more consistent you are, the more Mediimate Health Points you earn.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
