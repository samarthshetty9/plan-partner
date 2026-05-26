import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { FileText, Download, Eye } from "lucide-react";
import { API_BASE, getStoredToken } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Doc {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size_bytes: number | null;
  category: string;
  notes: string | null;
  created_at: string;
}

interface Props {
  patientId: string;
  doctorId: string;
}

const categoryColors: Record<string, string> = {
  lab_report: "bg-accent/10 text-accent",
  imaging: "bg-primary/10 text-primary",
  clinical_note: "bg-whatsapp/10 text-whatsapp",
  prescription: "bg-destructive/10 text-destructive",
  general: "bg-muted text-muted-foreground",
  consent: "bg-primary/10 text-primary",
};

const PatientDocsTab = ({ patientId, doctorId }: Props) => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const downloadFile = async (docId: string, fileName: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/patient_documents/${docId}/file`, {
        headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.get<Doc[]>("patient_documents", { patient_id: patientId });
        setDocs(Array.isArray(data) ? data : []);
      } catch {
        setDocs([]);
      }
      setLoading(false);
    };
    fetch();
  }, [patientId, doctorId]);

  if (loading) return <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;

  if (docs.length === 0) {
    return (
      <div className="glass-card rounded-xl p-8 text-center">
        <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No documents uploaded for this patient.</p>
      </div>
    );
  }

  // Group by category
  const grouped: Record<string, Doc[]> = {};
  docs.forEach((d) => {
    const cat = d.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(d);
  });

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Category Summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(grouped).map(([cat, catDocs]) => (
          <span key={cat} className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${categoryColors[cat] || categoryColors.general}`}>
            {cat.replace("_", " ")} ({catDocs.length})
          </span>
        ))}
      </div>

      {/* Documents Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {docs.map((d) => (
          <div key={d.id} className="glass-card rounded-xl p-4 space-y-2 hover:shadow-md transition-shadow">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-foreground truncate" title={d.file_name}>{d.file_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${categoryColors[d.category] || categoryColors.general}`}>
                    {d.category.replace("_", " ")}
                  </span>
                  {d.file_size_bytes && <span className="text-[10px] text-muted-foreground">{formatBytes(d.file_size_bytes)}</span>}
                </div>
              </div>
            </div>
            {d.notes && <p className="text-xs text-muted-foreground line-clamp-2">{d.notes}</p>}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground">{format(new Date(d.created_at), "MMM d, yyyy")}</p>
              <button onClick={() => downloadFile(d.id, d.file_name)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Download">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PatientDocsTab;
