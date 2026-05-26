import { useState } from "react";
import PatientDocuments from "./PatientDocuments";
import PatientLabResults from "./PatientLabResults";
import { FileText, FlaskConical } from "lucide-react";

const PatientDocumentsResults = () => {
  const [activeTab, setActiveTab] = useState<"documents" | "results">("documents");

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground truncate">Documents & Results</h1>
          <p className="text-muted-foreground text-sm">Manage your health records and lab results</p>
        </div>
      </div>

      <div className="flex bg-muted/50 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("documents")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "documents" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <FileText className="w-4 h-4" />
          Documents
        </button>
        <button
          onClick={() => setActiveTab("results")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "results" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <FlaskConical className="w-4 h-4" />
          Lab Results
        </button>
      </div>

      <div className="mt-4">
        {activeTab === "documents" && <PatientDocuments isEmbedded />}
        {activeTab === "results" && <PatientLabResults isEmbedded />}
      </div>
    </div>
  );
};

export default PatientDocumentsResults;
