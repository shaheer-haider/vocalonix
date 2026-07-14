import type {
  AgentResponse,
  AgentSettings,
  DocumentItem,
  WidgetResponse,
} from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  status: () =>
    request<{
      connected: boolean;
      workflow: { id: number; name: string; status: string };
    }>("/api/dograh/status"),
  getAgent: () => request<AgentResponse>("/api/agent"),
  updateAgent: (settings: AgentSettings) =>
    request<AgentResponse>("/api/agent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }),
  getWidget: () => request<WidgetResponse>("/api/agent/widget"),
  listDocuments: () => request<{ documents: DocumentItem[] }>("/api/knowledge"),
  uploadDocument: (file: File, retrievalMode: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("retrievalMode", retrievalMode);
    return request<{ document: unknown }>("/api/knowledge", {
      method: "POST",
      body: form,
    });
  },
  deleteDocument: (documentUuid: string) =>
    request<{ ok: boolean }>(`/api/knowledge/${encodeURIComponent(documentUuid)}`, {
      method: "DELETE",
    }),
};
