import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { MARKETPLACE_PLANS } from "@/data/marketplace-plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Lock, 
  CheckCircle2, 
  Clock, 
  Zap, 
  Trophy, 
  Users, 
  ChevronRight,
  Info,
  Calendar,
  Flame,
  Star,
  Sparkles
} from "lucide-react";

export default function MarketplacePlanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isEnrolling, setIsEnrolling] = useState(false);
  const plan = MARKETPLACE_PLANS.find(p => p.id === id);

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-slate-500 font-medium">Care plan not found.</p>
        <Button asChild variant="outline">
          <link to="/patient/care-plan/channel">Back to Channel</link>
        </Button>
      </div>
    );
  }

  // Days that are unlocked for preview
  const UNLOCKED_DAYS = [1, 2, 7, 9, 11];

  const handleEnroll = async () => {
    setIsEnrolling(true);
    // Simulate API call
    setTimeout(() => {
      setIsEnrolling(false);
      toast.success("Successfully enrolled in " + plan.name + "!");
      navigate("/patient/care-plan");
    }, 1000);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      {/* Back Button */}
      <Link 
        to="/patient/care-plan/channel" 
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to Marketplace
      </Link>

      {/* Plan Header */}
      <div className="relative rounded-3xl overflow-hidden bg-white border border-slate-200/60 shadow-xl">
        <div className="h-3 w-full" style={{ background: plan.cover_color }} />
        <div className="p-6 md:p-10 grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <div className="md:col-span-2 space-y-6">
            <div className="space-y-2">
              <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] font-black uppercase tracking-widest px-3 py-1">
                {plan.category}
              </Badge>
              <h1 className="text-3xl md:text-5xl font-black text-slate-800 tracking-tight leading-tight">
                {plan.name}
              </h1>
            </div>
            <p className="text-slate-600 text-lg font-medium leading-relaxed max-w-2xl">
              {plan.description}
            </p>
            <div className="flex flex-wrap gap-3">
              {plan.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-bold text-slate-700">{feature}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/60 space-y-6">
            <div className="flex items-center gap-4">
               <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 ring-4 ring-white shadow-md overflow-hidden">
                 {plan.coachImage ? (
                   <img src={plan.coachImage} alt={plan.coach} className="w-full h-full object-cover" />
                 ) : (
                   <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
                 )}
               </div>
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chief Coach</p>
                 <p className="text-base font-black text-slate-800 leading-none mb-1">{plan.coach}</p>
                 <p className="text-xs font-bold text-slate-500">{plan.coachRole}</p>
               </div>
            </div>
            
            <div className="space-y-3">
               <div className="flex justify-between items-center text-sm font-bold">
                 <span className="text-slate-500">Duration</span>
                 <span className="text-slate-900">{plan.duration_days} Days</span>
               </div>
               <div className="flex justify-between items-center text-sm font-bold">
                 <span className="text-slate-500">MHP Rewards</span>
                 <span className="text-amber-600 flex items-center gap-1"><Trophy className="w-4 h-4" /> Earn up to 2000</span>
               </div>
               <div className="flex justify-between items-center text-sm font-bold">
                 <span className="text-slate-500">Access</span>
                 <span className="text-slate-900 uppercase tracking-tighter text-xs">Lifetime</span>
               </div>
            </div>

            <Button onClick={handleEnroll} disabled={isEnrolling} className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-black text-lg rounded-xl shadow-lg shadow-slate-200 group">
              {isEnrolling ? "ENROLLING..." : "ENROLL NOW"}
              <Zap className="w-5 h-5 ml-2 text-amber-400 fill-amber-400 group-hover:scale-125 transition-transform" />
            </Button>
            <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-wider">
              Secure checkout • Instant Activation
            </p>
          </div>
        </div>
      </div>

      {/* Program Roadmap Preview */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-indigo-500" />
              Program Roadmap
            </h2>
            <p className="text-sm font-medium text-slate-500">Preview selected days from the full {plan.duration_days}-day protocol.</p>
          </div>
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none px-3 py-1 font-bold">
            <Lock className="w-3 h-3 mr-1.5" />
            Partial Preview
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plan.days.map((dayData) => {
            const isUnlocked = UNLOCKED_DAYS.includes(dayData.day);
            return (
              <Card 
                key={dayData.day} 
                className={`group relative overflow-hidden transition-all duration-300 ${
                  isUnlocked 
                    ? "border-emerald-200 bg-white shadow-md hover:shadow-lg" 
                    : "border-slate-100 bg-slate-50/50 grayscale-[0.5]"
                }`}
              >
                {!isUnlocked && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/40 p-6 text-center cursor-not-allowed">
                     <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center shadow-lg transform -translate-y-2 group-hover:translate-y-0 transition-transform">
                       <Lock className="w-5 h-5 text-white" />
                     </div>
                     <p className="mt-2 text-xs font-black text-slate-800 uppercase tracking-widest leading-none">Day {dayData.day} Locked</p>
                     <p className="text-[10px] text-slate-500 font-bold mt-1">Enroll to unlock</p>
                  </div>
                )}

                <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/30">
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isUnlocked ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      DAY {dayData.day}
                    </span>
                    {isUnlocked && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </div>
                  <CardTitle className="text-base font-black text-slate-800 mt-2 line-clamp-1">
                    {dayData.theme}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                   <div className={`space-y-4 ${!isUnlocked ? "opacity-10 blur-[10px] select-none pointer-events-none" : ""}`}>
                     <div className="space-y-3">
                       {dayData.tasks.map((task, idx) => (
                         <div key={idx} className="flex items-start gap-2 text-xs">
                           <div className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                             task.type === 'vital' ? 'bg-blue-400' : 
                             task.type === 'medicine' ? 'bg-rose-400' : 
                             task.type === 'action' ? 'bg-emerald-400' : 'bg-amber-400'
                           }`} />
                           <div>
                             <p className="font-bold text-slate-700 leading-none mb-0.5">{task.title}</p>
                             <p className="text-slate-500 font-medium leading-tight">{task.description}</p>
                           </div>
                         </div>
                       ))}
                     </div>

                     <div className="pt-2 flex items-center justify-between border-t border-slate-100 mt-2">
                       <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                         <Sparkles className="h-3 w-3" />
                         +{dayData.tasks.reduce((sum, t) => sum + t.points, 0)} MHP
                       </span>
                       {isUnlocked && (
                         <div className="text-[10px] font-black text-emerald-600 flex items-center gap-0.5">
                           PREVIEW <ChevronRight className="h-2.5 w-2.5" />
                         </div>
                       )}
                     </div>
                   </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Info Panel */}
      <Card className="bg-indigo-50 border-indigo-100 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Info className="w-32 h-32 text-indigo-900" />
        </div>
        <CardContent className="p-8 flex flex-col md:flex-row gap-8 items-center relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-xl shadow-indigo-200">
             <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-2 flex-1">
            <h3 className="text-xl font-black text-indigo-900">Your Data, Your Journey</h3>
            <p className="text-sm font-medium text-indigo-700/80 leading-relaxed max-w-2xl">
              Mediimate ensures your health data is encrypted and only shared with your chosen care team. 
              Our protocols are designed by specialists from Manipal Hospitals and certified by global standards.
            </p>
          </div>
          <div className="flex items-center gap-6 shrink-0">
             <div className="text-center">
               <p className="text-xl font-black text-indigo-950">100%</p>
               <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Secure</p>
             </div>
             <div className="text-center">
               <p className="text-xl font-black text-indigo-950">24/7</p>
               <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Support</p>
             </div>
          </div>
        </CardContent>
      </Card>
      
      {/* FAQ/CTA */}
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
         <h2 className="text-2xl font-black text-slate-800">Ready to transform?</h2>
         <Button onClick={handleEnroll} disabled={isEnrolling} size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-10 h-14 rounded-2xl shadow-xl shadow-emerald-100">
           {isEnrolling ? "ENROLLING..." : "ENROLL IN THIS PLAN"}
         </Button>
         <p className="text-xs text-slate-400 font-bold">CANCEL ATT ANYTIME • NO QUESTIONS ASKED</p>
      </div>
    </div>
  );
}

function ShieldCheck({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .52-.88l7-4a1 1 0 0 1 .96 0l7 4A1 1 0 0 1 20 6v7z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
