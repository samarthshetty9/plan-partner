export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "plan_partner_token";
const DOCTOR_TOKEN_KEY = "plan_partner_doctor_token";

export function getStoredToken(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setStoredToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getStoredDoctorToken(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(DOCTOR_TOKEN_KEY) : null;
}

export function setStoredDoctorToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(DOCTOR_TOKEN_KEY, token);
  else localStorage.removeItem(DOCTOR_TOKEN_KEY);
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Authorization"] = `Bearer ${token}`; // bypass Netlify stripping
  }
  return headers;
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = path.startsWith("/") ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
  if (!params || Object.keys(params).length === 0) return url;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const q = search.toString();
  if (!q) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${q}`;
}

const noCache = { cache: "no-store" as RequestCache };

export const api = {
  async get<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const res = await fetch(buildUrl(path, params), { headers: await getAuthHeaders(), ...noCache });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || res.statusText);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  },

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: await getAuthHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
      ...noCache,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || res.statusText);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  },

  async patch<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(buildUrl(path), {
      method: "PATCH",
      headers: await getAuthHeaders(),
      body: JSON.stringify(body),
      ...noCache,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || res.statusText);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  },

  async delete(path: string): Promise<void> {
    const res = await fetch(buildUrl(path), { method: "DELETE", headers: await getAuthHeaders(), ...noCache });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || res.statusText);
    }
  },

  async upload<T = unknown>(path: string, formData: FormData): Promise<T> {
    const headers: HeadersInit = {};
    const token = getStoredToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(buildUrl(path), { method: "POST", headers, body: formData, ...noCache });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error || res.statusText);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  },

  /** Fetch feedback video as blob URL (for playback). Call URL.revokeObjectURL when done. */
  async getFeedbackVideoUrl(feedbackId: string): Promise<string> {
    const token = getStoredToken() || getStoredDoctorToken();
    const res = await fetch(buildUrl(`feedbacks/${feedbackId}/video`), {
      headers: token ? { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` } : {},
      ...noCache,
    });
    if (!res.ok) throw new Error("Video not found");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};
