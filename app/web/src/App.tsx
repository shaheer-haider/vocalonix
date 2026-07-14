import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./api";
import {
  BookIcon,
  CopyIcon,
  PhoneIcon,
  SettingsIcon,
  TrashIcon,
  UploadIcon,
  WaveIcon,
} from "./icons";
import type {
  AgentSettings,
  DocumentItem,
  View,
  WidgetResponse,
} from "./types";

const NAV_ITEMS: Array<{
  id: View;
  label: string;
  icon: typeof PhoneIcon;
}> = [
  { id: "test", label: "Test Agent", icon: PhoneIcon },
  { id: "knowledge", label: "Knowledge Base", icon: BookIcon },
  { id: "settings", label: "Agent Settings", icon: SettingsIcon },
];

function formatBytes(bytes: number): string {
  if (!bytes) return "Processing";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ connected }: { connected: boolean | null }) {
  return (
    <div className={`status-badge ${connected === false ? "status-badge--offline" : ""}`}>
      <span className="status-dot" />
      {connected === null ? "Connecting" : connected ? "Dograh connected" : "Dograh offline"}
    </div>
  );
}

function TestAgent() {
  const [widget, setWidget] = useState<WidgetResponse | null>(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const existing = document.getElementById("dograh-widget-script");
    existing?.remove();
    document.getElementById("dograh-inline-container")?.replaceChildren();

    api
      .getWidget()
      .then((payload) => {
        if (cancelled) return;
        setWidget(payload);
        const script = document.createElement("script");
        script.id = "dograh-widget-script";
        script.src = payload.scriptUrl;
        script.async = true;
        script.onload = () => {
          setStatus("ready");
          window.DograhWidget?.onStatusChange(setStatus);
          window.DograhWidget?.onError((value) => {
            setError(value instanceof Error ? value.message : "The call could not be started.");
            setStatus("failed");
          });
        };
        script.onerror = () => {
          setError("The Dograh widget could not be loaded.");
          setStatus("failed");
        };
        document.body.appendChild(script);
      })
      .catch((value: unknown) => {
        if (!cancelled) {
          setError(value instanceof Error ? value.message : "Failed to prepare the call.");
          setStatus("failed");
        }
      });

    return () => {
      cancelled = true;
      window.DograhWidget?.end();
      document.getElementById("dograh-widget-script")?.remove();
      document.getElementById("dograh-inline-container")?.replaceChildren();
    };
  }, []);

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WebRTC playground</p>
          <h1>Test your agent</h1>
          <p>Talk to the same agent your website visitors will reach.</p>
        </div>
        <span className={`call-state call-state--${status}`}>
          {status === "connected" ? "Live call" : status === "connecting" ? "Connecting" : "Ready"}
        </span>
      </div>

      <div className="test-grid">
        <div className="call-card">
          <div className="orb-wrap">
            <div className={`voice-orb ${status === "connected" ? "voice-orb--active" : ""}`}>
              <WaveIcon size={42} />
            </div>
            <div className="orb-ring orb-ring--one" />
            <div className="orb-ring orb-ring--two" />
          </div>
          <h2>{status === "connected" ? "You are speaking with your agent" : "Ready when you are"}</h2>
          <p>
            Allow microphone access, ask a question from your knowledge base, and confirm the
            greeting and tone feel right.
          </p>
          {error ? <div className="alert alert--error">{error}</div> : null}
          <div id="dograh-inline-container" className="dograh-slot">
            {!widget && !error ? <div className="loading-line">Preparing secure call…</div> : null}
          </div>
        </div>

        <aside className="tips-card">
          <p className="eyebrow">Quick test</p>
          <h3>Try these prompts</h3>
          <ol>
            <li>Ask the agent to introduce itself.</li>
            <li>Ask a question answered by an uploaded document.</li>
            <li>Interrupt the agent mid-sentence.</li>
            <li>End the conversation naturally.</li>
          </ol>
          <div className="privacy-note">
            <strong>Browser calls only</strong>
            Audio is handled by your self-hosted Dograh stack. No phone provider is required.
          </div>
        </aside>
      </div>
    </section>
  );
}

function KnowledgeBase() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [retrievalMode, setRetrievalMode] = useState("full_document");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.listDocuments();
      setDocuments(response.documents);
      setError(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const processing = useMemo(
    () =>
      documents.some((document) =>
        ["pending", "processing"].includes(document.processing_status),
      ),
    [documents],
  );

  useEffect(() => {
    if (!processing) return;
    const interval = window.setInterval(() => void load(), 4_000);
    return () => window.clearInterval(interval);
  }, [load, processing]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      await api.uploadDocument(file, retrievalMode);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(document: DocumentItem) {
    if (!window.confirm(`Delete "${document.filename}"?`)) return;
    try {
      await api.deleteDocument(document.document_uuid);
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Delete failed.");
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Agent context</p>
          <h1>Knowledge base</h1>
          <p>Upload reference material. Completed documents are attached to the agent automatically.</p>
        </div>
      </div>

      <div className="upload-panel">
        <div className="upload-copy">
          <div className="upload-icon">
            <UploadIcon size={24} />
          </div>
          <div>
            <h3>{uploading ? "Uploading document…" : "Add a document"}</h3>
            <p>PDF, DOC, DOCX, TXT, or JSON up to 5MB.</p>
          </div>
        </div>
        <div className="upload-actions">
          <select
            value={retrievalMode}
            onChange={(event) => setRetrievalMode(event.target.value)}
            aria-label="Retrieval mode"
          >
            <option value="full_document">Full document</option>
            <option value="chunked">Chunked search</option>
          </select>
          <label className={`button button--primary ${uploading ? "button--disabled" : ""}`}>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.json"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.currentTarget.value = "";
              }}
            />
            Choose file
          </label>
        </div>
      </div>

      {error ? <div className="alert alert--error">{error}</div> : null}

      <div className="documents-card">
        <div className="card-title-row">
          <div>
            <h2>Documents</h2>
            <p>{documents.length} source{documents.length === 1 ? "" : "s"}</p>
          </div>
          <button className="button button--ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading documents…</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <BookIcon size={30} />
            <strong>No knowledge yet</strong>
            <span>Upload a small FAQ or product document to test grounded answers.</span>
          </div>
        ) : (
          <div className="document-list">
            {documents.map((document) => (
              <article className="document-row" key={document.document_uuid}>
                <div className="file-mark">
                  <BookIcon size={19} />
                </div>
                <div className="document-main">
                  <div className="document-name">
                    {document.filename}
                    <span className={`document-status status-${document.processing_status}`}>
                      {document.processing_status}
                    </span>
                  </div>
                  <div className="document-meta">
                    {formatBytes(document.file_size_bytes)} ·{" "}
                    {document.retrieval_mode === "chunked" ? `${document.total_chunks} chunks` : "full document"}
                  </div>
                  {document.processing_error ? (
                    <div className="document-error">{document.processing_error}</div>
                  ) : null}
                </div>
                <button
                  className="icon-button icon-button--danger"
                  aria-label={`Delete ${document.filename}`}
                  onClick={() => void remove(document)}
                >
                  <TrashIcon size={18} />
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AgentSettingsView() {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [widget, setWidget] = useState<WidgetResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [agent, widgetResponse] = await Promise.all([api.getAgent(), api.getWidget()]);
      setSettings(agent.settings);
      setWidget(widgetResponse);
      setError(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not load agent settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
    setMessage(null);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.updateAgent(settings);
      setSettings(response.settings);
      setWidget(await api.getWidget());
      setMessage("Agent updated and published to Dograh.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <div className="empty-state">{error || "Loading agent settings…"}</div>;
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dograh workflow</p>
          <h1>Agent settings</h1>
          <p>These fields rebuild and publish the managed Dograh workflow.</p>
        </div>
        <button className="button button--primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Publishing…" : "Save & publish"}
        </button>
      </div>

      {message ? <div className="alert alert--success">{message}</div> : null}
      {error ? <div className="alert alert--error">{error}</div> : null}

      <div className="settings-grid">
        <div className="settings-card">
          <div className="card-title-row">
            <div>
              <h2>Voice agent</h2>
              <p>Identity and conversation behavior</p>
            </div>
          </div>

          <div className="form-grid form-grid--two">
            <label>
              <span>Agent name</span>
              <input
                value={settings.agentName}
                onChange={(event) => update("agentName", event.target.value)}
              />
            </label>
            <label>
              <span>Business name</span>
              <input
                value={settings.businessName}
                onChange={(event) => update("businessName", event.target.value)}
              />
            </label>
          </div>

          <label>
            <span>Greeting</span>
            <textarea
              rows={3}
              value={settings.greeting}
              onChange={(event) => update("greeting", event.target.value)}
            />
          </label>

          <label>
            <span>Main instructions</span>
            <textarea
              rows={8}
              value={settings.prompt}
              onChange={(event) => update("prompt", event.target.value)}
            />
            <small>Uploaded documents are attached automatically after processing.</small>
          </label>

          <label>
            <span>Closing</span>
            <textarea
              rows={3}
              value={settings.closing}
              onChange={(event) => update("closing", event.target.value)}
            />
          </label>

          <label className="toggle-row">
            <div>
              <span>Allow interruptions</span>
              <small>Let callers speak while the agent is responding.</small>
            </div>
            <input
              type="checkbox"
              checked={settings.allowInterrupt}
              onChange={(event) => update("allowInterrupt", event.target.checked)}
            />
          </label>
        </div>

        <div className="settings-stack">
          <div className="settings-card">
            <div className="card-title-row">
              <div>
                <h2>Widget</h2>
                <p>Inline website call experience</p>
              </div>
            </div>
            <label>
              <span>Button text</span>
              <input
                value={settings.widgetButtonText}
                onChange={(event) => update("widgetButtonText", event.target.value)}
              />
            </label>
            <label>
              <span>Accent color</span>
              <div className="color-field">
                <input
                  type="color"
                  value={settings.widgetColor}
                  onChange={(event) => update("widgetColor", event.target.value)}
                />
                <input
                  value={settings.widgetColor}
                  onChange={(event) => update("widgetColor", event.target.value)}
                />
              </div>
            </label>
          </div>

          <div className="settings-card">
            <div className="card-title-row">
              <div>
                <h2>Website snippet</h2>
                <p>Paste before the closing body tag.</p>
              </div>
              <button
                className="icon-button"
                aria-label="Copy website snippet"
                disabled={!widget}
                onClick={() => {
                  if (widget) {
                    void navigator.clipboard.writeText(widget.snippet);
                    setMessage("Website snippet copied.");
                  }
                }}
              >
                <CopyIcon size={18} />
              </button>
            </div>
            <pre className="snippet">{widget?.snippet || "Generating snippet…"}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [view, setView] = useState<View>("test");
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      api
        .status()
        .then(() => {
          if (!cancelled) setConnected(true);
        })
        .catch(() => {
          if (!cancelled) setConnected(false);
        });
    };
    check();
    const interval = window.setInterval(check, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <WaveIcon size={24} />
          </div>
          <div>
            <strong>Vocalonix</strong>
            <span>Voice agents</span>
          </div>
        </div>

        <nav>
          <p className="nav-label">Agent workspace</p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-item nav-item--active" : "nav-item"}
                onClick={() => setView(item.id)}
              >
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <StatusBadge connected={connected} />
          <p>Core MVP · Dograh {connected ? "online" : "starting"}</p>
        </div>
      </aside>

      <main>
        {view === "test" ? <TestAgent /> : null}
        {view === "knowledge" ? <KnowledgeBase /> : null}
        {view === "settings" ? <AgentSettingsView /> : null}
      </main>
    </div>
  );
}
