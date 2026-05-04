import { useState, useRef, useEffect } from "react";
import { getStoredToken } from "@/lib/api";
import { Bot, Send, X, Sparkles, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const EVIDENCE_QUERY_KEY = "__EVIDENCE__";

const QUICK_QUERIES = [
  { label: "📋 Summarize patient", query: "Give me a full clinical summary of this patient." },
  { label: "⚠️ Abnormalities", query: "Are there any abnormal vitals or lab results?" },
  { label: "📈 Trends", query: "Analyze trends in this patient's vitals and lab results over time." },
  { label: "💊 Med review", query: "Review this patient's current medications against their conditions." },
  { label: "🔍 Risk assessment", query: "What clinical risks should I be aware of for this patient?" },
  { label: "📚 Find evidence", query: EVIDENCE_QUERY_KEY },
];

interface DoctorCopilotProps {
  patientId: string;
  patientName: string;
}

const DoctorCopilot = ({ patientId, patientName }: DoctorCopilotProps) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
    }
  };

  const fetchEvidence = async () => {
    const userMsg: Msg = { role: "user", content: "Find relevant clinical evidence for this patient's conditions." };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const token = getStoredToken();
      const resp = await fetch(`${API_BASE}/clinical-evidence`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ patient_id: patientId }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to search evidence" }));
        toast({ title: "Error", description: err.error || "Evidence search failed", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const data = await resp.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    } catch (e) {
      console.error("Evidence search error:", e);
      toast({ title: "Error", description: "Failed to search evidence", variant: "destructive" });
    }

    setIsLoading(false);
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    if (text === EVIDENCE_QUERY_KEY) {
      fetchEvidence();
      return;
    }

    const userMsg: Msg = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    let assistantSoFar = "";

    try {
      const token = getStoredToken();
      const resp = await fetch(`${API_BASE}/chat/doctor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: updatedMessages, patient_id: patientId }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to connect" }));
        toast({ title: "Error", description: err.error || "Something went wrong", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      const upsertAssistant = (nextChunk: string) => {
        assistantSoFar += nextChunk;
        const content = assistantSoFar;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
          }
          return [...prev, { role: "assistant", content }];
        });
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("Doctor chat error:", e);
      toast({ title: "Error", description: "Failed to get response", variant: "destructive" });
    }

    setIsLoading(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl flex items-center justify-center transition-all hover:scale-105 group"
        title="Clinical Copilot"
      >
        <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
      </button>
    );
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-4rem)] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-primary/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-heading font-bold text-foreground">Clinical Copilot</p>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{patientName}</p>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!hasMessages && (
          <div className="text-center py-6">
            <Bot className="w-10 h-10 text-primary/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Ask anything about <span className="font-medium text-foreground">{patientName}</span>'s records
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_QUERIES.map((q) => (
                <button
                  key={q.label}
                  onClick={() => send(q.query)}
                  className="px-2.5 py-1.5 text-xs rounded-full border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted text-foreground rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-1">
        <div className="relative border border-border rounded-xl bg-background focus-within:ring-2 focus-within:ring-primary/30 transition-shadow">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResize(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask about this patient's records..."
            rows={1}
            className="w-full resize-none bg-transparent pl-3 pr-12 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 bottom-2 w-8 h-8 rounded-lg bg-primary/80 hover:bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DoctorCopilot;
