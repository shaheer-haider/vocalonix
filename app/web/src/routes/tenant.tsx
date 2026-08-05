import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  api,
  type BusinessHoursDay,
  type TenantConfigSnapshot,
  type TenantConfigVersion,
  type TenantKnowledgeItem,
  type TenantSettingsResponse,
  type TenantWidget,
} from "../api";
import { OnboardingShell } from "../components/shell/OnboardingShell";
import {
  Alert,
  Box,
  Button,
  ColorField,
  EmptyState,
  LoadingState,
  Modal,
  Pill,
  SelectField,
  TextArea,
  TextField,
} from "../components/ui";
import { can } from "../permissions";
import { COUNTRY_OPTIONS, useBusinessSlug, WorkspaceShell } from "./business";

const onboardingSteps = [
  { label: "Business profile", slug: "business-profile" },
  { label: "Agent", slug: "agent" },
  { label: "Knowledge", slug: "knowledge" },
  { label: "Widget", slug: "widget" },
  { label: "Review and publish", slug: "review" },
] as const;

const profileSchema = z.object({
  name: z.string().min(2, "Enter a business name.").max(120),
  city: z.string().max(120),
  country: z.string().length(2, "Use a two-letter country code."),
  timezone: z.string().min(1, "Enter a timezone.").max(80),
  contactEmail: z.string().email("Enter a valid email.").or(z.literal("")),
  vertical: z.string().max(80),
});

const agentSchema = z.object({
  agentName: z.string().min(1, "Enter an agent name.").max(80),
  greeting: z.string().min(1, "Enter a greeting.").max(500),
  prompt: z.string().min(1, "Enter agent instructions.").max(4000),
  closing: z.string().min(1, "Enter a closing.").max(500),
  tone: z.string().min(1).max(40),
  voice: z.string().min(1).max(40),
  allowInterrupt: z.boolean(),
  escalationGuidance: z.string().min(1, "Enter escalation guidance.").max(1000),
});

const widgetSchema = z.object({
  widgetButtonText: z.string().min(1, "Enter a widget label.").max(80),
  widgetColor: z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color."),
  allowedDomains: z.string().max(10_000),
});

const TONE_OPTIONS = [
  { label: "Warm", value: "warm" },
  { label: "Professional", value: "professional" },
  { label: "Concise", value: "concise" },
  { label: "Friendly", value: "friendly" },
];

const VOICE_OPTIONS = [
  { label: "Natural", value: "natural" },
  { label: "Calm", value: "calm" },
  { label: "Energetic", value: "energetic" },
  { label: "Measured", value: "measured" },
];

function withSavedOption(
  options: { label: string; value: string }[],
  saved: string,
): { label: string; value: string }[] {
  if (!saved || options.some((option) => option.value === saved)) return options;
  return [
    { label: saved.charAt(0).toUpperCase() + saved.slice(1), value: saved },
    ...options,
  ];
}

type ProfileValues = z.infer<typeof profileSchema>;
type AgentValues = z.infer<typeof agentSchema>;
type WidgetValues = z.infer<typeof widgetSchema>;

function useTenantConfiguration() {
  const slug = useBusinessSlug();
  const [data, setData] = useState<TenantSettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.businesses.settings(slug));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load business settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, error, loading, refresh, slug };
}

function ConfigurationState({
  children,
}: {
  children: (
    data: TenantSettingsResponse,
    refresh: () => Promise<void>,
    slug: string,
  ) => ReactNode;
}) {
  const state = useTenantConfiguration();
  if (state.loading) return <LoadingState label="Loading settings…" />;
  if (state.error || !state.data) {
    return <Alert variant="error">{state.error ?? "Settings are unavailable."}</Alert>;
  }
  return <>{children(state.data, state.refresh, state.slug)}</>;
}

function ProfileForm({
  data,
  nextHref,
  onSaved,
  slug,
}: {
  data: TenantSettingsResponse;
  nextHref?: string;
  onSaved?: () => Promise<void>;
  slug: string;
}) {
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: data.business.name,
      city: data.business.city ?? "",
      country: data.business.country,
      timezone: data.business.timezone,
      contactEmail: data.business.contactEmail ?? "",
      vertical: data.business.vertical ?? "",
    },
  });
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        setNotice(null);
        try {
          await api.businesses.updateProfile(slug, {
            ...values,
            city: values.city || undefined,
            contactEmail: values.contactEmail || undefined,
            vertical: values.vertical || undefined,
          });
          await onSaved?.();
          if (nextHref) {
            window.location.assign(nextHref);
          } else {
            setNotice("Business profile saved.");
          }
        } catch (caught) {
          setNotice(
            caught instanceof Error ? caught.message : "Unable to save the profile.",
          );
        }
      })}
    >
      <Box style={{ padding: 24 }}>
        <h2>Business profile</h2>
        <p className="auth-card-copy">
          This identity and location become saved context for the browser voice agent.
        </p>
        <div className="form-grid">
          <TextField
            label="Business name"
            required
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <TextField
            label="Contact email"
            type="email"
            error={form.formState.errors.contactEmail?.message}
            {...form.register("contactEmail")}
          />
          <TextField
            label="City"
            error={form.formState.errors.city?.message}
            {...form.register("city")}
          />
          <SelectField
            label="Country"
            required
            error={form.formState.errors.country?.message}
            options={COUNTRY_OPTIONS}
            {...form.register("country")}
          />
          <TextField
            label="Timezone"
            required
            helper="Use an IANA timezone such as America/New_York."
            error={form.formState.errors.timezone?.message}
            {...form.register("timezone")}
          />
          <TextField
            label="Business type"
            error={form.formState.errors.vertical?.message}
            {...form.register("vertical")}
          />
        </div>
        {notice ? <Alert variant={notice.endsWith("saved.") ? "success" : "error"}>{notice}</Alert> : null}
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          {nextHref ? "Save and continue →" : "Save profile"}
        </Button>
      </Box>
    </form>
  );
}

function AgentForm({
  data,
  nextHref,
  onSaved,
  slug,
}: {
  data: TenantSettingsResponse;
  nextHref?: string;
  onSaved?: () => Promise<void>;
  slug: string;
}) {
  const form = useForm<AgentValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      agentName: data.settings.agentName,
      greeting: data.settings.greeting,
      prompt: data.settings.prompt,
      closing: data.settings.closing,
      tone: data.settings.tone,
      voice: data.settings.voice,
      allowInterrupt: data.settings.allowInterrupt,
      escalationGuidance: data.settings.escalationGuidance,
    },
  });
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        setNotice(null);
        try {
          await api.businesses.updateAgentSettings(slug, values);
          await onSaved?.();
          if (nextHref) window.location.assign(nextHref);
          else setNotice("Agent settings saved.");
        } catch (caught) {
          setNotice(
            caught instanceof Error ? caught.message : "Unable to save agent settings.",
          );
        }
      })}
    >
      <Box style={{ padding: 24 }}>
        <h2>Agent</h2>
        <p className="auth-card-copy">
          Configure a browser-based voice conversation grounded in saved context and
          knowledge. No phone routing or booking tools are enabled.
        </p>
        <div className="form-grid">
          <TextField
            label="Agent name"
            required
            error={form.formState.errors.agentName?.message}
            {...form.register("agentName")}
          />
          <SelectField
            label="Tone"
            options={withSavedOption(TONE_OPTIONS, data.settings.tone)}
            {...form.register("tone")}
          />
          <SelectField
            label="Voice style"
            helper="This guides the workflow's speaking style without changing global model credentials."
            options={withSavedOption(VOICE_OPTIONS, data.settings.voice)}
            {...form.register("voice")}
          />
        </div>
        <TextArea
          label="Greeting"
          required
          error={form.formState.errors.greeting?.message}
          {...form.register("greeting")}
        />
        <TextArea
          label="Agent instructions"
          required
          helper="Describe supported questions and guardrails. Do not promise unimplemented tools."
          error={form.formState.errors.prompt?.message}
          {...form.register("prompt")}
        />
        <TextArea
          label="Escalation guidance"
          required
          error={form.formState.errors.escalationGuidance?.message}
          {...form.register("escalationGuidance")}
        />
        <TextArea
          label="Closing"
          required
          error={form.formState.errors.closing?.message}
          {...form.register("closing")}
        />
        <label className="ui-check-row">
          <input type="checkbox" {...form.register("allowInterrupt")} />
          <span>
            Allow visitors to interrupt agent speech
            <small>Applied as workflow-level interruption behavior.</small>
          </span>
        </label>
        {notice ? <Alert variant={notice.endsWith("saved.") ? "success" : "error"}>{notice}</Alert> : null}
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          {nextHref ? "Save and continue →" : "Save agent"}
        </Button>
      </Box>
    </form>
  );
}

function WidgetForm({
  data,
  nextHref,
  onSaved,
  slug,
}: {
  data: TenantSettingsResponse;
  nextHref?: string;
  onSaved?: () => Promise<void>;
  slug: string;
}) {
  const form = useForm<WidgetValues>({
    resolver: zodResolver(widgetSchema),
    defaultValues: {
      widgetButtonText: data.settings.widgetButtonText,
      widgetColor: data.settings.widgetColor,
      allowedDomains: data.settings.allowedDomains.join("\n"),
    },
  });
  const [notice, setNotice] = useState<string | null>(null);
  const color = form.watch("widgetColor");
  const label = form.watch("widgetButtonText");

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        setNotice(null);
        try {
          await api.businesses.updateWidget(slug, {
            widgetButtonText: values.widgetButtonText,
            widgetColor: values.widgetColor,
            allowedDomains: values.allowedDomains
              .split(/\r?\n|,/)
              .map((domain) => domain.trim())
              .filter(Boolean),
          });
          await onSaved?.();
          if (nextHref) window.location.assign(nextHref);
          else setNotice("Widget settings saved.");
        } catch (caught) {
          setNotice(
            caught instanceof Error ? caught.message : "Unable to save widget settings.",
          );
        }
      })}
    >
      <Box style={{ padding: 24 }}>
        <h2>Widget</h2>
        <p className="auth-card-copy">
          Publish a domain-restricted browser voice widget. The embed token is public;
          Dograh management credentials remain server-only.
        </p>
        <div className="form-grid">
          <TextField
            label="Button label"
            required
            error={form.formState.errors.widgetButtonText?.message}
            {...form.register("widgetButtonText")}
          />
          <ColorField
            label="Button color"
            required
            error={form.formState.errors.widgetColor?.message}
            value={form.watch("widgetColor")}
            onChange={(value) => form.setValue("widgetColor", value, { shouldValidate: true })}
          />
        </div>
        <TextArea
          label="Allowed domains"
          helper="One hostname per line, such as example.com. Leave empty for unrestricted local testing."
          error={form.formState.errors.allowedDomains?.message}
          {...form.register("allowedDomains")}
        />
        <div className="widget-preview">
          <span>Preview</span>
          <button type="button" style={{ backgroundColor: color }}>
            {label || "Talk to us"}
          </button>
        </div>
        {notice ? <Alert variant={notice.endsWith("saved.") ? "success" : "error"}>{notice}</Alert> : null}
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          {nextHref ? "Save and continue →" : "Save widget"}
        </Button>
      </Box>
    </form>
  );
}

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function defaultHours(
  value: Record<string, BusinessHoursDay>,
): Record<string, BusinessHoursDay> {
  return Object.fromEntries(
    days.map((day) => [
      day,
      value[day] ?? {
        enabled: day !== "Saturday" && day !== "Sunday",
        open: "09:00",
        close: "17:00",
      },
    ]),
  );
}

function HoursForm({
  data,
  onSaved,
  slug,
}: {
  data: TenantSettingsResponse;
  onSaved: () => Promise<void>;
  slug: string;
}) {
  const [hours, setHours] = useState(defaultHours(data.settings.businessHours));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Box style={{ padding: 24 }}>
      <h2>Business hours</h2>
      <p className="auth-card-copy">
        Hours are supplied to the agent as context only. They do not provide live
        availability or booking.
      </p>
      <div className="hours-grid">
        {days.map((day) => {
          const entry = hours[day]!;
          return (
            <div className="hours-row" key={day}>
              <label>
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(event) =>
                    setHours({
                      ...hours,
                      [day]: { ...entry, enabled: event.target.checked },
                    })
                  }
                />
                {day}
              </label>
              <input
                className="ui-input"
                type="time"
                disabled={!entry.enabled}
                value={entry.open}
                onChange={(event) =>
                  setHours({
                    ...hours,
                    [day]: { ...entry, open: event.target.value },
                  })
                }
              />
              <input
                className="ui-input"
                type="time"
                disabled={!entry.enabled}
                value={entry.close}
                onChange={(event) =>
                  setHours({
                    ...hours,
                    [day]: { ...entry, close: event.target.value },
                  })
                }
              />
            </div>
          );
        })}
      </div>
      {notice ? <Alert variant={notice.endsWith("saved.") ? "success" : "error"}>{notice}</Alert> : null}
      <Button
        variant="primary"
        loading={saving}
        onClick={() => {
          setSaving(true);
          setNotice(null);
          void api.businesses
            .updateHours(slug, hours)
            .then(onSaved)
            .then(() => setNotice("Business hours saved."))
            .catch((caught: unknown) =>
              setNotice(
                caught instanceof Error
                  ? caught.message
                  : "Unable to save business hours.",
              ),
            )
            .finally(() => setSaving(false));
        }}
      >
        Save hours
      </Button>
    </Box>
  );
}

function parseWebsiteUrl(sourceText: string | null): string | null {
  if (!sourceText) return null;
  const match = sourceText.match(/^Website reference: (.*)$/m);
  const url = match?.[1]?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    // ignore malformed URLs
  }
  return null;
}

function KnowledgeManager({
  onboardingNextHref,
  slug,
}: {
  onboardingNextHref?: string;
  slug: string;
}) {
  const [items, setItems] = useState<TenantKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<"document" | "text" | "website_reference">(
    "text",
  );
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [file, setFile] = useState<File | undefined>();
  const [replacementId, setReplacementId] = useState<string | undefined>();
  const [previewId, setPreviewId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.businesses.knowledge(slug));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load knowledge.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const processing = useMemo(
    () =>
      items.some((item) =>
        ["pending", "uploading", "processing"].includes(item.state),
      ),
    [items],
  );

  useEffect(() => {
    if (!processing) return;
    const interval = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(interval);
  }, [processing, refresh]);

  async function saveKnowledge() {
    if (!title.trim()) {
      setError("Enter a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.businesses.createKnowledge(slug, {
        kind,
        title,
        text: text || undefined,
        websiteUrl: websiteUrl || undefined,
        file,
        retrievalMode: kind === "text" ? "full_document" : "chunked",
        replacementId,
      });
      setTitle("");
      setText("");
      setWebsiteUrl("");
      setFile(undefined);
      setReplacementId(undefined);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save knowledge.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-stack">
      <Box style={{ padding: 24 }}>
        <h2>{replacementId ? "Upload replacement" : "Add knowledge"}</h2>
        <p className="auth-card-copy">
          Website URLs are saved as reference text only; this product does not crawl
          them.
        </p>
        {replacementId ? (
          <Alert variant="warn">
            The prior working document stays attached until this replacement is
            processed and published.
          </Alert>
        ) : null}
        <SelectField
          label="Knowledge type"
          value={kind}
          options={[
            { label: "Text section", value: "text" },
            { label: "Document", value: "document" },
            { label: "Website reference", value: "website_reference" },
          ]}
          onChange={(event) =>
            setKind(
              event.target.value as "document" | "text" | "website_reference",
            )
          }
        />
        <TextField
          label="Title"
          value={title}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
        {kind === "document" ? (
          <TextField
            label="Document"
            type="file"
            accept=".pdf,.doc,.docx,.txt,.json"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        ) : null}
        {kind === "website_reference" ? (
          <TextField
            label="Website reference"
            type="url"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />
        ) : null}
        {kind !== "document" ? (
          <TextArea
            label={kind === "text" ? "Knowledge text" : "Reference notes"}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        ) : null}
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="stack-row">
          {replacementId ? (
            <Button
              variant="ghost"
              onClick={() => {
                setReplacementId(undefined);
                setTitle("");
                setText("");
                setWebsiteUrl("");
                setFile(undefined);
              }}
            >
              Cancel replacement
            </Button>
          ) : null}
          <Button variant="primary" loading={saving} onClick={() => void saveKnowledge()}>
            {replacementId ? "Save replacement" : "Add knowledge"}
          </Button>
        </div>
      </Box>
      <Box style={{ padding: 24 }}>
        <div className="account-section__heading">
          <div>
            <h2>Saved knowledge</h2>
            <p>Only this business can list, replace, attach, or delete these rows.</p>
          </div>
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
        {loading ? (
          <LoadingState label="Loading knowledge…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No knowledge yet"
          >
            Add text, a document, or a website reference.
          </EmptyState>
        ) : (
          <div className="knowledge-list">
            {items.map((item) => {
              const expanded = previewId === item.id;
              const websiteUrl =
                item.kind === "website_reference"
                  ? parseWebsiteUrl(item.sourceText)
                  : null;
              return (
                <div className="knowledge-item" key={item.id}>
                  <div className="knowledge-row">
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.kind.replaceAll("_", " ")} · {item.state.replaceAll("_", " ")}
                      </span>
                      {item.lastError ? <small>{item.lastError}</small> : null}
                    </div>
                    <div className="stack-row">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setPreviewId(expanded ? null : item.id)
                        }
                      >
                        {expanded ? "Hide preview" : "Preview"}
                      </Button>
                      {item.active && item.kind === "text" ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setKind("text");
                            setReplacementId(item.id);
                            setTitle(item.title);
                            setText(item.sourceText ?? "");
                            setWebsiteUrl("");
                            setFile(undefined);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Replace
                        </Button>
                      ) : null}
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setError(null);
                          void api.businesses
                            .deleteKnowledge(slug, item.id)
                            .then(refresh)
                            .catch((caught: unknown) =>
                              setError(
                                caught instanceof Error
                                  ? caught.message
                                  : "Unable to delete knowledge.",
                              ),
                            );
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="knowledge-preview">
                      {item.kind === "document" ? (
                        <>
                          <p className="knowledge-preview__label">Document</p>
                          <p>{item.filename}</p>
                          <p className="knowledge-preview__meta">{item.mimeType}</p>
                        </>
                      ) : item.kind === "website_reference" && websiteUrl ? (
                        (() => {
                          const notes = item.sourceText
                            ? item.sourceText.split("\n").slice(2).join("\n").trim()
                            : "";
                          return (
                            <>
                              <p className="knowledge-preview__label">Website reference</p>
                              <a href={websiteUrl} rel="noreferrer" target="_blank">
                                {websiteUrl}
                              </a>
                              {notes ? <pre>{notes}</pre> : null}
                            </>
                          );
                        })()
                      ) : (
                        <>
                          <p className="knowledge-preview__label">Knowledge text</p>
                          <pre>{item.sourceText ?? "No content available."}</pre>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Box>
      {onboardingNextHref ? (
        <Box style={{ padding: 24 }}>
          <h2>Knowledge step</h2>
          <p className="auth-card-copy">
            Continue after the knowledge you want is saved. Processing can finish in
            the background without losing this progress.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              setError(null);
              void api.businesses
                .completeKnowledgeOnboarding(slug)
                .then(() => window.location.assign(onboardingNextHref))
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "Unable to save the knowledge step.",
                  ),
                );
            }}
          >
            Save step and continue →
          </Button>
        </Box>
      ) : null}
    </div>
  );
}

const knowledgeTabs = [
  { slug: "sources", label: "Sources" },
  { slug: "answers", label: "Answers" },
  { slug: "gaps", label: "Gaps" },
] as const;

type KnowledgeTab = (typeof knowledgeTabs)[number]["slug"];

function initialKnowledgeTab(): KnowledgeTab {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  return knowledgeTabs.some((tab) => tab.slug === hash)
    ? (hash as KnowledgeTab)
    : "sources";
}

export function KnowledgeWorkspace({ slug }: { slug: string }) {
  const [tab, setTab] = useState<KnowledgeTab>(initialKnowledgeTab);

  return (
    <div className="settings-stack">
      <nav className="config-tabs" aria-label="Knowledge">
        {knowledgeTabs.map((item) => (
          <a
            key={item.slug}
            className={`config-tab ${tab === item.slug ? "config-tab--active" : ""}`.trim()}
            aria-current={tab === item.slug ? "page" : undefined}
            href={`#${item.slug}`}
            onClick={() => setTab(item.slug)}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {tab === "sources" ? <KnowledgeManager slug={slug} /> : null}
      {tab === "answers" ? <AnswersTab slug={slug} /> : null}
      {tab === "gaps" ? <GapsTab /> : null}
    </div>
  );
}

function AnswersTab({ slug }: { slug: string }) {
  const [items, setItems] = useState<TenantKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [replacementId, setReplacementId] = useState<string | undefined>();
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(
        (await api.businesses.knowledge(slug)).filter(
          (item) => item.kind === "text",
        ),
      );
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load answers.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = items.filter((item) =>
    item.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function save() {
    if (!question.trim() || !answer.trim()) {
      setError("Write the question and what the agent should say.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.businesses.createKnowledge(slug, {
        kind: "text",
        title: question,
        text: answer,
        retrievalMode: "full_document",
        replacementId,
      });
      setQuestion("");
      setAnswer("");
      setWriting(false);
      setReplacementId(undefined);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save the answer.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-stack">
      <Box style={{ padding: 24 }}>
        <div className="account-section__heading">
          <div>
            <h2>What the agent says</h2>
            <p>
              Written answers reach callers on the first call after you
              republish.
            </p>
          </div>
          {!writing ? (
            <Button
              variant="primary"
              onClick={() => {
                setWriting(true);
                setReplacementId(undefined);
                setQuestion("");
                setAnswer("");
              }}
            >
              Write an answer
            </Button>
          ) : null}
        </div>
        {writing ? (
          <div className="answer-editor">
            <TextField
              label="The question, as a caller asks it"
              required
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <TextArea
              label="What the agent says"
              required
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
            />
            {error ? <Alert variant="error">{error}</Alert> : null}
            <div className="stack-row">
              <Button variant="ghost" onClick={() => setWriting(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                {replacementId ? "Save the new wording" : "Save answer"}
              </Button>
            </div>
          </div>
        ) : null}
        <TextField
          label="Find an answer"
          placeholder="Search by question…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!writing && error ? <Alert variant="error">{error}</Alert> : null}
        {loading ? (
          <LoadingState label="Loading answers…" />
        ) : visible.length === 0 ? (
          <EmptyState title={query ? "Nothing matches that" : "No written answers yet"}>
            {query
              ? "No written answer mentions that. Try the Sources tab, or write it yourself."
              : "Write the first answer and the agent starts using it after the next publish."}
          </EmptyState>
        ) : (
          <div className="knowledge-list">
            {visible.map((item) => {
              const expanded = openId === item.id;
              return (
                <div className="knowledge-item" key={item.id}>
                  <div className="knowledge-row">
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.state === "active" ? "In use" : item.state.replaceAll("_", " ")}
                        {" · "}
                        {(item.sourceText ?? "").length} characters
                      </span>
                      {item.lastError ? <small>{item.lastError}</small> : null}
                    </div>
                    <div className="stack-row">
                      <Button variant="ghost" onClick={() => setOpenId(expanded ? null : item.id)}>
                        {expanded ? "Close" : "Check it"}
                      </Button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="knowledge-preview">
                      <p className="knowledge-preview__label">What the agent says</p>
                      <pre>{item.sourceText ?? "No content available."}</pre>
                      <div className="stack-row">
                        {item.active ? (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setWriting(true);
                              setReplacementId(item.id);
                              setQuestion(item.title);
                              setAnswer(item.sourceText ?? "");
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Rewrite it
                          </Button>
                        ) : null}
                        <Button
                          variant="destructive"
                          onClick={() => {
                            setError(null);
                            void api.businesses
                              .deleteKnowledge(slug, item.id)
                              .then(refresh)
                              .catch((caught: unknown) =>
                                setError(
                                  caught instanceof Error
                                    ? caught.message
                                    : "Unable to delete the answer.",
                                ),
                              );
                          }}
                        >
                          Stop answering this
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Box>
    </div>
  );
}

const sampleGaps = [
  {
    q: "Do you take Bupa dental insurance?",
    count: "Asked 4×, last 40 minutes ago",
    said: "I am not able to say which insurers we work with. Can I take your number and someone will call you back?",
    note: "Nothing in any source mentions Bupa.",
  },
  {
    q: "Do you do sedation for nervous patients?",
    count: "Asked 3×, last 2 hours ago",
    said: "I am not sure whether we offer that. Shall I get someone to ring you?",
    note: "The website mentions nervous patients but never sedation.",
  },
  {
    q: "Can I pay in instalments?",
    count: "Asked 2×, last 2 days ago",
    said: "I cannot set up a payment plan on this call. I will pass it to the front desk.",
    note: "Nothing on finance in any source.",
  },
];

function GapsTab() {
  return (
    <div className="settings-stack">
      <Alert variant="info" title="Design preview">
        Gaps will fill from real conversations once the unanswered-question feed
        lands. The rows below are sample data.
      </Alert>
      <Box style={{ padding: 24 }}>
        <h2>Asked, and the agent had nothing</h2>
        <p className="auth-card-copy">
          Pulled straight out of conversations. Answer one and it leaves this
          queue.
        </p>
        <div className="knowledge-list">
          {sampleGaps.map((gap) => (
            <div className="knowledge-item" key={gap.q}>
              <div className="knowledge-row">
                <div>
                  <strong>“{gap.q}”</strong>
                  <span>{gap.count}</span>
                  <small>{gap.note}</small>
                </div>
                <Pill variant="warn">No answer</Pill>
              </div>
              <div className="knowledge-preview">
                <p className="knowledge-preview__label">What the agent said instead</p>
                <pre>{gap.said}</pre>
              </div>
            </div>
          ))}
        </div>
      </Box>
    </div>
  );
}

function SyncStatus({ data }: { data: TenantSettingsResponse }) {
  const variant =
    data.dograh.syncState === "synced"
      ? "good"
      : data.dograh.syncState === "rejected" ||
          data.dograh.syncState === "failed"
        ? "warn"
        : "default";
  return (
    <Box style={{ padding: 20 }}>
      <div className="account-section__heading">
        <div>
          <p className="eyebrow">Dograh synchronization</p>
          <h2>{data.dograh.syncState.replaceAll("_", " ")}</h2>
        </div>
        <Pill variant={variant}>{data.dograh.syncState}</Pill>
      </div>
      {data.dograh.lastError ? (
        <Alert variant="error">{data.dograh.lastError}</Alert>
      ) : (
        <p className="auth-card-copy">
          {data.dograh.syncState === "synced"
            ? "This business has its own published Dograh workflow."
            : "Saved Vocalonix changes are waiting for this business only."}
        </p>
      )}
    </Box>
  );
}

function BrowserTestCall({ widget }: { widget: TenantWidget }) {
  const [status, setStatus] = useState("Ready to load the published web-call widget.");
  const [error, setError] = useState<string | null>(null);
  return (
    <Box style={{ padding: 20 }}>
      <h2>Browser test call</h2>
      <p className="auth-card-copy">{status}</p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button
        variant="accent"
        onClick={() => {
          setError(null);
          document.getElementById("vocalonix-tenant-widget-script")?.remove();
          window.DograhWidget?.end();
          const script = document.createElement("script");
          script.id = "vocalonix-tenant-widget-script";
          script.src = widget.scriptUrl;
          script.async = true;
          script.onload = () => {
            setStatus("Widget loaded. Requesting microphone access for a web call…");
            window.DograhWidget?.onStatusChange((state, text, subtext) => {
              setStatus([text ?? state, subtext].filter(Boolean).join(" — "));
            });
            window.DograhWidget?.onCallStart(() =>
              setStatus("Connecting the call…"),
            );
            window.DograhWidget?.onCallConnected(() =>
              setStatus("Call connected. Speak with the agent, then hang up when done."),
            );
            window.DograhWidget?.onCallEnd(() =>
              setStatus("Call ended. Start another test call anytime."),
            );
            window.DograhWidget?.onError((value) => {
              setError(
                value instanceof Error
                  ? value.message
                  : "The call could not be started. Check microphone access and try again.",
              );
            });
            window.setTimeout(() => window.DograhWidget?.start(), 1000);
          };
          script.onerror = () => setStatus("The published widget could not be loaded.");
          document.body.appendChild(script);
        }}
      >
        Start browser test call
      </Button>
      <p className="ui-field-message">Web call only. No phone setup is required.</p>
    </Box>
  );
}

function ReviewPublish({
  data,
  refresh,
  slug,
}: {
  data: TenantSettingsResponse;
  refresh: () => Promise<void>;
  slug: string;
}) {
  const [widget, setWidget] = useState<TenantWidget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!data.onboarding.publishedAt) return;
    void api.businesses
      .widget(slug)
      .then(setWidget)
      .catch(() => setWidget(null));
  }, [data.onboarding.publishedAt, slug]);

  return (
    <div className="settings-stack">
      <SyncStatus data={data} />
      <Box style={{ padding: 24 }}>
        <h2>Review and publish</h2>
        <p className="auth-card-copy">
          Publish saves and synchronizes only {data.business.name}, validates its
          workflow, and creates a business-scoped embed token.
        </p>
        <div className="review-grid">
          <span>Agent</span>
          <strong>{data.settings.agentName}</strong>
          <span>Knowledge</span>
          <strong>Tenant-scoped saved rows</strong>
          <span>Widget</span>
          <strong>
            {data.settings.widgetButtonText} · {data.settings.widgetColor}
          </strong>
          <span>Call channel</span>
          <strong>Browser voice only</strong>
        </div>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {data.onboarding.publishedAt ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Pill variant="good">Published</Pill>
            <a
              href={`/app/${slug}/dashboard`}
              className="ui-button ui-button--primary"
            >
              Go to dashboard
            </a>
            <Button
              variant="ghost"
              loading={publishing}
              onClick={() => {
                setPublishing(true);
                setError(null);
                void api.businesses
                  .publish(slug)
                  .then(async (result) => {
                    setWidget(result.widget);
                    await refresh();
                  })
                  .catch((caught: unknown) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Unable to publish.",
                    ),
                  )
                  .finally(() => setPublishing(false));
              }}
            >
              Republish
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            loading={publishing}
            onClick={() => {
              setPublishing(true);
              setError(null);
              void api.businesses
                .publish(slug)
                .then(async (result) => {
                  setWidget(result.widget);
                  await refresh();
                })
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "Unable to publish.",
                  ),
                )
                .finally(() => setPublishing(false));
            }}
          >
            Publish this business
          </Button>
        )}
      </Box>
      {widget ? (
        <>
          <Box style={{ padding: 20 }}>
            <h2>Tenant embed snippet</h2>
            <CodeSnippet value={widget.snippet} />
          </Box>
          <BrowserTestCall widget={widget} />
        </>
      ) : (
        <EmptyState
          title="Widget not published"
        >
          Publish successfully to generate this business's embed snippet and test
          action.
        </EmptyState>
      )}
    </div>
  );
}

export function TenantOnboardingPage() {
  const params = useParams({ strict: false }) as { step?: string };
  const step = onboardingSteps.some((item) => item.slug === params.step)
    ? params.step!
    : "business-profile";
  return (
    <ConfigurationState>
      {(data, refresh, slug) => {
        if (!can(data.business.role, "agent.edit")) {
          return (
            <div className="auth-shell">
              <Box style={{ padding: 32, textAlign: "center" }}>
                <Pill variant="warn">{data.business.role}</Pill>
                <h1 className="account-title" style={{ marginTop: 12 }}>
                  You do not have access here
                </h1>
                <p className="auth-card-copy">
                  Ask an Owner or Admin to update your workspace role.
                </p>
              </Box>
            </div>
          );
        }
        return (
          <OnboardingShell
            title={data.business.name}
            currentSlug={step}
            businessSlug={slug}
            steps={onboardingSteps.map((item) => ({
              ...item,
              done: data.onboarding.completedSteps.includes(item.slug),
            }))}
          >
            {step === "business-profile" ? (
              <ProfileForm
                data={data}
                slug={slug}
                onSaved={refresh}
                nextHref={`/app/${slug}/onboarding/agent`}
              />
            ) : null}
            {step === "agent" ? (
              <AgentForm
                data={data}
                slug={slug}
                onSaved={refresh}
                nextHref={`/app/${slug}/onboarding/knowledge`}
              />
            ) : null}
            {step === "knowledge" ? (
              <KnowledgeManager
                slug={slug}
                onboardingNextHref={`/app/${slug}/onboarding/widget`}
              />
            ) : null}
            {step === "widget" ? (
              <WidgetForm
                data={data}
                slug={slug}
                onSaved={refresh}
                nextHref={`/app/${slug}/onboarding/review`}
              />
            ) : null}
            {step === "review" ? (
              <ReviewPublish data={data} refresh={refresh} slug={slug} />
            ) : null}
          </OnboardingShell>
        );
      }}
    </ConfigurationState>
  );
}

const CONFIG_FIELD_LABELS: Record<string, { label: string; section: string }> = {
  name: { label: "Business name", section: "Business" },
  city: { label: "City", section: "Business" },
  country: { label: "Country", section: "Business" },
  timezone: { label: "Timezone", section: "Business" },
  contactEmail: { label: "Contact email", section: "Business" },
  vertical: { label: "Kind of business", section: "Business" },
  agentName: { label: "Agent name", section: "Agent" },
  greeting: { label: "Greeting", section: "Agent" },
  prompt: { label: "Agent instructions", section: "Agent" },
  closing: { label: "Closing", section: "Agent" },
  tone: { label: "Tone", section: "Agent" },
  voice: { label: "Voice", section: "Agent" },
  allowInterrupt: { label: "Callers may interrupt", section: "Agent" },
  escalationGuidance: { label: "Escalation guidance", section: "Agent" },
  businessHours: { label: "Opening hours", section: "Hours" },
  widgetButtonText: { label: "Launcher label", section: "Appearance" },
  widgetColor: { label: "Accent colour", section: "Appearance" },
  allowedDomains: { label: "Allowed domains", section: "Widget" },
};

function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, BusinessHoursDay>);
    return entries
      .map(([day, hours]) =>
        hours.enabled ? `${day.slice(0, 3)} ${hours.open}–${hours.close}` : `${day.slice(0, 3)} shut`,
      )
      .join(" · ");
  }
  return String(value);
}

export interface ConfigDiffEntry {
  key: string;
  label: string;
  section: string;
  from: string;
  to: string;
}

function configDiff(
  live: TenantConfigSnapshot,
  draft: TenantConfigSnapshot,
): ConfigDiffEntry[] {
  return Object.keys(CONFIG_FIELD_LABELS)
    .filter(
      (key) =>
        JSON.stringify(live[key as keyof TenantConfigSnapshot] ?? null) !==
        JSON.stringify(draft[key as keyof TenantConfigSnapshot] ?? null),
    )
    .map((key) => ({
      key,
      label: CONFIG_FIELD_LABELS[key]!.label,
      section: CONFIG_FIELD_LABELS[key]!.section,
      from: formatConfigValue(live[key as keyof TenantConfigSnapshot]),
      to: formatConfigValue(draft[key as keyof TenantConfigSnapshot]),
    }));
}

function useConfigVersions(slug: string) {
  const [versions, setVersions] = useState<TenantConfigVersion[]>([]);
  const [draft, setDraft] = useState<TenantConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.businesses.configVersions(slug);
      setVersions(result.versions);
      setDraft(result.draft);
    } catch {
      setVersions([]);
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { versions, draft, loading, refresh };
}

function DiffModal({
  diff,
  fromLabel = "Live now",
  onClose,
  onRepublish,
  publishing,
}: {
  diff: ConfigDiffEntry[];
  fromLabel?: string;
  onClose: () => void;
  onRepublish?: () => void;
  publishing?: boolean;
}) {
  return (
    <Modal open onClose={onClose} titleId="config-diff-title">
      <h2 id="config-diff-title">What republishing would change</h2>
      {diff.length === 0 ? (
        <EmptyState title="Nothing to publish">
          Your draft matches the live agent line for line.
        </EmptyState>
      ) : (
        <div className="config-diff">
          {diff.map((entry) => (
            <div className="config-diff__row" key={entry.key}>
              <p className="eyebrow">
                {entry.section} · {entry.label}
              </p>
              <div className="config-diff__values">
                <div>
                  <span>{fromLabel}</span>
                  <p>{entry.from}</p>
                </div>
                <div>
                  <span>Your draft</span>
                  <p>{entry.to}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="stack-row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <Button variant="ghost" onClick={onClose}>
          Back to editing
        </Button>
        {onRepublish && diff.length > 0 ? (
          <Button variant="primary" loading={publishing} onClick={onRepublish}>
            Republish now
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}

function PublishBanner({
  canPublish,
  data,
  refresh,
  slug,
}: {
  canPublish: boolean;
  data: TenantSettingsResponse;
  refresh: () => Promise<void>;
  slug: string;
}) {
  const { versions, draft, loading, refresh: refreshVersions } = useConfigVersions(slug);
  const [publishing, setPublishing] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = versions[0] ?? null;
  const diff = latest && draft ? configDiff(latest.config, draft) : [];
  const published = Boolean(data.onboarding.publishedAt) || versions.length > 0;
  const pending = published && latest !== null && diff.length > 0;

  async function republish() {
    setPublishing(true);
    setError(null);
    try {
      await api.businesses.publish(slug);
      await Promise.all([refresh(), refreshVersions()]);
      setShowDiff(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to publish.");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return null;

  return (
    <>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {publishing ? (
        <div className="publish-banner publish-banner--working">
          <Pill variant="info">Publishing</Pill>
          <p>Publishing to the live widget… knowledge is re-attached automatically.</p>
        </div>
      ) : pending ? (
        <div className="publish-banner publish-banner--pending">
          <Pill variant="warn">Changes pending</Pill>
          <p>
            {diff.length === 1
              ? `You edited ${diff[0]!.label.toLowerCase()}.`
              : `You have ${diff.length} unpublished edits.`}{" "}
            Visitors still hear the old version until you republish.
          </p>
          <span className="stack-row">
            <Button variant="ghost" onClick={() => setShowDiff(true)}>
              See the diff
            </Button>
            {canPublish ? (
              <Button variant="primary" loading={publishing} onClick={() => void republish()}>
                Republish
              </Button>
            ) : null}
          </span>
        </div>
      ) : published ? (
        <div className="publish-banner publish-banner--live">
          <Pill variant="good">Live</Pill>
          <p>
            The live agent matches your draft line for line.
            {latest
              ? ` Version ${latest.version} · published ${new Date(latest.publishedAt).toLocaleString()}.`
              : ""}
          </p>
          <a href={`/app/${slug}/settings/history`}>View history</a>
        </div>
      ) : (
        <div className="publish-banner publish-banner--draft">
          <Pill>Draft</Pill>
          <p>Nothing here reaches a caller until you publish for the first time.</p>
          {canPublish ? (
            <Button variant="primary" loading={publishing} onClick={() => void republish()}>
              Publish
            </Button>
          ) : null}
        </div>
      )}
      {showDiff ? (
        <DiffModal
          diff={diff}
          onClose={() => setShowDiff(false)}
          onRepublish={canPublish ? () => void republish() : undefined}
          publishing={publishing}
        />
      ) : null}
    </>
  );
}

function AppearanceForm({
  data,
  onSaved,
  slug,
}: {
  data: TenantSettingsResponse;
  onSaved: () => Promise<void>;
  slug: string;
}) {
  const [label, setLabel] = useState(data.settings.widgetButtonText);
  const [color, setColor] = useState(data.settings.widgetColor);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="config-columns">
      <Box style={{ padding: 24 }}>
        <h2>Appearance</h2>
        <p className="auth-card-copy">
          The live widget changes when you republish, not while you type here.
        </p>
        <TextField
          label="Launcher label"
          required
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <ColorField
          label="Accent colour"
          required
          value={color}
          onChange={setColor}
        />
        {notice ? (
          <Alert variant={notice.endsWith("saved.") ? "success" : "error"}>{notice}</Alert>
        ) : null}
        <Button
          variant="primary"
          loading={saving}
          onClick={() => {
            setSaving(true);
            setNotice(null);
            void api.businesses
              .updateWidget(slug, {
                widgetButtonText: label,
                widgetColor: color,
                allowedDomains: data.settings.allowedDomains,
              })
              .then(onSaved)
              .then(() => setNotice("Appearance saved."))
              .catch((caught: unknown) =>
                setNotice(
                  caught instanceof Error ? caught.message : "Unable to save appearance.",
                ),
              )
              .finally(() => setSaving(false));
          }}
        >
          Save appearance
        </Button>
      </Box>
      <Box tone="tinted" style={{ padding: 24 }}>
        <p className="eyebrow">Preview · your site</p>
        <div className="widget-stage">
          <span className="widget-stage__label">YOUR PAGE</span>
          <button
            type="button"
            className="widget-stage__launcher"
            style={{ backgroundColor: color }}
          >
            {label || "Talk to us"}
          </button>
        </div>
      </Box>
    </div>
  );
}

function WidgetTab({
  canEdit,
  data,
  refresh,
  slug,
}: {
  canEdit: boolean;
  data: TenantSettingsResponse;
  refresh: () => Promise<void>;
  slug: string;
}) {
  const [domains, setDomains] = useState(data.settings.allowedDomains.join("\n"));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [widget, setWidget] = useState<TenantWidget | null>(null);

  useEffect(() => {
    if (!data.onboarding.publishedAt) return;
    void api.businesses
      .widget(slug)
      .then(setWidget)
      .catch(() => setWidget(null));
  }, [data.onboarding.publishedAt, slug]);

  return (
    <div className="settings-stack">
      <Box style={{ padding: 24 }}>
        <h2>Where it may load</h2>
        <TextArea
          label="Allowed domains"
          helper="One hostname per line. Empty means any site can load your widget."
          value={domains}
          readOnly={!canEdit}
          onChange={(event) => setDomains(event.target.value)}
        />
        {notice ? (
          <Alert variant={notice.endsWith("saved.") ? "success" : "error"}>{notice}</Alert>
        ) : null}
        {canEdit ? (
          <Button
            variant="primary"
            loading={saving}
            onClick={() => {
              setSaving(true);
              setNotice(null);
              void api.businesses
                .updateWidget(slug, {
                  widgetButtonText: data.settings.widgetButtonText,
                  widgetColor: data.settings.widgetColor,
                  allowedDomains: domains
                    .split(/\r?\n|,/)
                    .map((domain) => domain.trim())
                    .filter(Boolean),
                })
                .then(refresh)
                .then(() => setNotice("Widget settings saved."))
                .catch((caught: unknown) =>
                  setNotice(
                    caught instanceof Error
                      ? caught.message
                      : "Unable to save widget settings.",
                  ),
                )
                .finally(() => setSaving(false));
            }}
          >
            Save domains
          </Button>
        ) : null}
      </Box>
      {widget ? (
        <>
          <Box style={{ padding: 24 }}>
            <div style={{ marginBottom: 12 }}>
              <h2>Put it on your site</h2>
              <p>Paste once, at the end of the page. It never needs changing again.</p>
            </div>
            <CodeSnippet
              value={widget.snippet}
              label="Your embed code"
              copyLabel="Copy snippet"
            />
          </Box>
          <BrowserTestCall widget={widget} />
        </>
      ) : (
        <EmptyState title="Widget not published">
          Publish this business to generate its embed snippet and browser test call.
        </EmptyState>
      )}
    </div>
  );
}

function CodeSnippet({
  value,
  label,
  copyLabel,
}: {
  value: string;
  label?: string;
  copyLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="code-snippet">
      <div className="code-snippet__bar">
        {label ? <span className="eyebrow">{label}</span> : <span />}
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? "Copied" : (copyLabel ?? "Copy")}
        </Button>
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </div>
  );
}

function versionSummary(
  version: TenantConfigVersion,
  previous: TenantConfigVersion | undefined,
): string[] {
  if (!previous) return ["First version that took a real call"];
  const diff = configDiff(previous.config, version.config);
  if (diff.length === 0) return ["Republished without config changes"];
  return diff.map((entry) => `${entry.label}: ${entry.to}`);
}

function HistoryTab({
  canEdit,
  refresh,
  slug,
}: {
  canEdit: boolean;
  refresh: () => Promise<void>;
  slug: string;
}) {
  const { versions, draft, loading } = useConfigVersions(slug);
  const [compare, setCompare] = useState<TenantConfigVersion | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function restore(version: TenantConfigVersion) {
    setRestoring(true);
    setNotice(null);
    const config = version.config;
    try {
      await api.businesses.updateProfile(slug, {
        name: config.name,
        city: config.city ?? undefined,
        country: config.country,
        timezone: config.timezone,
        contactEmail: config.contactEmail ?? undefined,
        vertical: config.vertical ?? undefined,
      });
      await api.businesses.updateAgentSettings(slug, {
        agentName: config.agentName,
        greeting: config.greeting,
        prompt: config.prompt,
        closing: config.closing,
        tone: config.tone,
        voice: config.voice,
        allowInterrupt: config.allowInterrupt,
        escalationGuidance: config.escalationGuidance,
      });
      await api.businesses.updateHours(slug, config.businessHours);
      await api.businesses.updateWidget(slug, {
        widgetButtonText: config.widgetButtonText,
        widgetColor: config.widgetColor,
        allowedDomains: config.allowedDomains,
      });
      await refresh();
      setNotice(`Version ${version.version} restored into your draft. Republish to make it live.`);
      setConfirming(null);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Unable to restore this version.");
    } finally {
      setRestoring(false);
    }
  }

  if (loading) return <LoadingState label="Loading history…" />;

  return (
    <div className="settings-stack">
      <Box style={{ padding: 24 }}>
        <h2>Every version that answered a call</h2>
        <p className="auth-card-copy">
          Restoring writes into your draft. Callers hear it only once you republish.
        </p>
        {notice ? (
          <Alert variant={notice.includes("restored") ? "success" : "error"}>{notice}</Alert>
        ) : null}
        {versions.length === 0 ? (
          <EmptyState title="No published versions yet">
            Publish this business and every published version will appear here.
          </EmptyState>
        ) : (
          <div className="history-list">
            {versions.map((version, index) => {
              const lines = versionSummary(version, versions[index + 1]);
              return (
                <div className="history-item" key={version.id}>
                  <div className="history-item__head">
                    <div>
                      <strong>Version {version.version}</strong>
                      <span>
                        {new Date(version.publishedAt).toLocaleString()} ·{" "}
                        {version.publishedByName ?? "Unknown"}
                      </span>
                    </div>
                    {index === 0 ? <Pill variant="good">Live</Pill> : null}
                  </div>
                  <ul>
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div className="stack-row">
                    {draft ? (
                      <Button variant="ghost" onClick={() => setCompare(version)}>
                        Compare with draft
                      </Button>
                    ) : null}
                    {canEdit && index !== 0 ? (
                      confirming === version.id ? (
                        <>
                          <span>Overwrite your current draft?</span>
                          <Button
                            variant="primary"
                            loading={restoring}
                            onClick={() => void restore(version)}
                          >
                            Yes, restore it
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirming(null)}>
                            Keep my draft
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" onClick={() => setConfirming(version.id)}>
                          Restore
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Box>
      {compare && draft ? (
        <DiffModal
          diff={configDiff(compare.config, draft)}
          fromLabel={`Version ${compare.version}`}
          onClose={() => setCompare(null)}
        />
      ) : null}
    </div>
  );
}

const configTabs = [
  { slug: "business", label: "Business" },
  { slug: "agent", label: "Agent" },
  { slug: "hours", label: "Hours" },
  { slug: "widget", label: "Widget" },
  { slug: "appearance", label: "Appearance" },
  { slug: "history", label: "History" },
] as const;

export type ConfigTab = (typeof configTabs)[number]["slug"];

export function TenantSettingsPage({
  section = "business",
}: {
  section?: ConfigTab | "knowledge";
}) {
  return (
    <WorkspaceShell>
      {(business) => (
        <ConfigurationState>
          {(data, refresh, slug) => {
            const canEditAgent = can(business.role, "agent.edit");
            if (section === "knowledge") {
              return can(business.role, "knowledge.manage") ? (
                <KnowledgeWorkspace slug={slug} />
              ) : (
                <Alert variant="warn">Your role cannot manage business knowledge.</Alert>
              );
            }
            const readOnlyNote = (
              <Alert variant="warn">Your role can view but cannot edit these settings.</Alert>
            );
            return (
              <div className="settings-stack">
                <PublishBanner
                  canPublish={canEditAgent}
                  data={data}
                  refresh={refresh}
                  slug={slug}
                />
                <nav className="config-tabs" aria-label="Configuration">
                  {configTabs.map((tab) => (
                    <a
                      key={tab.slug}
                      className={`config-tab ${section === tab.slug ? "config-tab--active" : ""}`.trim()}
                      aria-current={section === tab.slug ? "page" : undefined}
                      href={`/app/${slug}/settings/${tab.slug}`}
                    >
                      {tab.label}
                    </a>
                  ))}
                </nav>
                {section === "business" ? (
                  canEditAgent ? (
                    <ProfileForm data={data} onSaved={refresh} slug={slug} />
                  ) : (
                    readOnlyNote
                  )
                ) : null}
                {section === "agent" ? (
                  canEditAgent ? (
                    <AgentForm data={data} onSaved={refresh} slug={slug} />
                  ) : (
                    readOnlyNote
                  )
                ) : null}
                {section === "hours" ? (
                  canEditAgent ? (
                    <HoursForm data={data} onSaved={refresh} slug={slug} />
                  ) : (
                    readOnlyNote
                  )
                ) : null}
                {section === "widget" ? (
                  <WidgetTab
                    canEdit={canEditAgent}
                    data={data}
                    refresh={refresh}
                    slug={slug}
                  />
                ) : null}
                {section === "appearance" ? (
                  canEditAgent ? (
                    <AppearanceForm data={data} onSaved={refresh} slug={slug} />
                  ) : (
                    readOnlyNote
                  )
                ) : null}
                {section === "history" ? (
                  <HistoryTab canEdit={canEditAgent} refresh={refresh} slug={slug} />
                ) : null}
                <SyncStatus data={data} />
              </div>
            );
          }}
        </ConfigurationState>
      )}
    </WorkspaceShell>
  );
}
