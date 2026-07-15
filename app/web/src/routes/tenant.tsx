import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  api,
  type BusinessHoursDay,
  type TenantKnowledgeItem,
  type TenantSettingsResponse,
  type TenantWidget,
} from "../api";
import { OnboardingShell } from "../components/shell/OnboardingShell";
import {
  Alert,
  Box,
  Button,
  EmptyState,
  LoadingState,
  Pill,
  SelectField,
  TextArea,
  TextField,
} from "../components/ui";
import { can } from "../permissions";
import { useBusinessSlug, WorkspaceShell } from "./business";

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
          <TextField
            label="Country code"
            required
            error={form.formState.errors.country?.message}
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
            options={[
              { label: "Warm", value: "warm" },
              { label: "Professional", value: "professional" },
              { label: "Concise", value: "concise" },
              { label: "Friendly", value: "friendly" },
            ]}
            {...form.register("tone")}
          />
          <SelectField
            label="Voice style"
            helper="This guides the workflow's speaking style without changing global model credentials."
            options={[
              { label: "Natural", value: "natural" },
              { label: "Calm", value: "calm" },
              { label: "Energetic", value: "energetic" },
              { label: "Measured", value: "measured" },
            ]}
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
          <TextField
            label="Button color"
            required
            error={form.formState.errors.widgetColor?.message}
            {...form.register("widgetColor")}
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
            {items.map((item) => (
              <div className="knowledge-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {item.kind.replaceAll("_", " ")} · {item.state.replaceAll("_", " ")}
                  </span>
                  {item.lastError ? <small>{item.lastError}</small> : null}
                </div>
                <div className="stack-row">
                  {item.active ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setReplacementId(item.id);
                        setTitle(`${item.title} replacement`);
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
            ))}
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
  return (
    <Box style={{ padding: 20 }}>
      <h2>Browser test call</h2>
      <p className="auth-card-copy">{status}</p>
      <Button
        variant="accent"
        onClick={() => {
          document.getElementById("vocalonix-tenant-widget-script")?.remove();
          window.DograhWidget?.end();
          const script = document.createElement("script");
          script.id = "vocalonix-tenant-widget-script";
          script.src = widget.scriptUrl;
          script.async = true;
          script.onload = () => {
            setStatus("Widget loaded. Requesting microphone access for a web call…");
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
                  caught instanceof Error ? caught.message : "Unable to publish.",
                ),
              )
              .finally(() => setPublishing(false));
          }}
        >
          Publish this business
        </Button>
      </Box>
      {widget ? (
        <>
          <Box style={{ padding: 20 }}>
            <h2>Tenant embed snippet</h2>
            <TextArea readOnly className="ui-input--mono" value={widget.snippet} />
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
    <WorkspaceShell requiredPermission="agent.edit">
      {(business) => (
        <ConfigurationState>
          {(data, refresh, slug) => (
            <OnboardingShell
              title={business.name}
              currentSlug={step}
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
          )}
        </ConfigurationState>
      )}
    </WorkspaceShell>
  );
}

export function TenantSettingsPage({
  section = "overview",
}: {
  section?: "overview" | "profile" | "agent" | "knowledge" | "hours" | "widget";
}) {
  return (
    <WorkspaceShell>
      {(business) => (
        <ConfigurationState>
          {(data, refresh, slug) => {
            const canEditAgent = can(business.role, "agent.edit");
            if (section === "profile") {
              return canEditAgent ? (
                <ProfileForm data={data} onSaved={refresh} slug={slug} />
              ) : (
                <Alert variant="warn">
                  Your role can view but cannot edit business settings.
                </Alert>
              );
            }
            if (section === "agent") {
              return canEditAgent ? (
                <AgentForm data={data} onSaved={refresh} slug={slug} />
              ) : (
                <Alert variant="warn">
                  Your role can view but cannot edit agent settings.
                </Alert>
              );
            }
            if (section === "hours") {
              return canEditAgent ? (
                <HoursForm data={data} onSaved={refresh} slug={slug} />
              ) : (
                <Alert variant="warn">
                  Your role can view but cannot edit business hours.
                </Alert>
              );
            }
            if (section === "widget") {
              return canEditAgent ? (
                <WidgetForm data={data} onSaved={refresh} slug={slug} />
              ) : (
                <Alert variant="warn">
                  Your role can view but cannot edit widget settings.
                </Alert>
              );
            }
            if (section === "knowledge") {
              return can(business.role, "knowledge.manage") ? (
                <KnowledgeManager slug={slug} />
              ) : (
                <Alert variant="warn">
                  Your role cannot manage business knowledge.
                </Alert>
              );
            }
            return (
              <div className="settings-stack">
                <SyncStatus data={data} />
                <Box style={{ padding: 24 }}>
                  <h2>Settings</h2>
                  <div className="settings-links">
                    <a href={`/app/${slug}/settings/profile`}>Business profile</a>
                    <a href={`/app/${slug}/settings/agent`}>Agent</a>
                    <a href={`/app/${slug}/settings/knowledge`}>Knowledge</a>
                    <a href={`/app/${slug}/settings/hours`}>Business hours</a>
                    <a href={`/app/${slug}/settings/widget`}>Widget</a>
                  </div>
                </Box>
                <Box style={{ padding: 24 }}>
                  <h2>Onboarding</h2>
                  <p className="auth-card-copy">
                    Resume from {data.onboarding.currentStep.replaceAll("-", " ")}.
                  </p>
                  <a
                    className="ui-button ui-button--primary"
                    href={`/app/${slug}/onboarding/${data.onboarding.currentStep}`}
                  >
                    Resume onboarding
                  </a>
                </Box>
              </div>
            );
          }}
        </ConfigurationState>
      )}
    </WorkspaceShell>
  );
}
