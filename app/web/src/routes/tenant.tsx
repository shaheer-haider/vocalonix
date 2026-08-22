import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useParams } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  api,
  ApiClientError,
  type BusinessHoursDay,
  type TenantConfigSnapshot,
  type TenantConfigVersion,
  type KnowledgeGap,
  type TenantKnowledgeItem,
  type TenantSettings,
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
import { CopyIcon } from "../icons";
import { useVerticals, verticalOptions } from "../hooks/useVerticals";
import type { BillingStatus } from "../types";
import { PlanGrid, usePricing } from "./pricing";
import type {
  AvailableNumber,
  BusinessPhoneNumber,
  BusinessPhoneResponse,
  PooledNumber,
  VoiceCatalogueEntry,
  VoiceWidgetStatus,
} from "../types";
import { can } from "../permissions";
import { useNavigate } from "@tanstack/react-router";
import { COUNTRY_OPTIONS, useBusinessSlug, WorkspaceShell } from "./business";
import { timezoneOptions } from "../timezones";

const onboardingSteps = [
  { label: "Business profile", slug: "business-profile" },
  { label: "Agent", slug: "agent" },
  { label: "Opening hours", slug: "hours" },
  { label: "Knowledge", slug: "knowledge" },
  { label: "Widget", slug: "widget" },
  { label: "Plan", slug: "plan" },
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
  transferPhone: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value === "" || /^\+\d{8,15}$/.test(value.replace(/[\s\-().]/g, "")), {
      message: "Use full international format, for example +14155550123.",
    }),
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

/**
 * Success vs error used to be inferred with `notice.endsWith("saved.")`, so any
 * message that didn't happen to end that way rendered as an error — including the
 * "version restored" confirmation — and a server error ending in "saved." rendered
 * green. The tone is now carried explicitly.
 */
type Notice = { tone: "info" | "success" | "error"; message: string };

const ok = (message: string): Notice => ({ tone: "success", message });
/** For changes staged in the form but not yet written — "saved" would be a lie. */
const staged = (message: string): Notice => ({ tone: "info", message });
const fail = (caught: unknown, fallback: string): Notice => ({
  tone: "error",
  message: caught instanceof Error ? caught.message : fallback,
});

/**
 * `updateWidget` is a whole-object write. The Appearance and Widget tabs each own
 * half of it, and each used to fill the other half from its own render snapshot —
 * so editing both without a refresh silently discarded one set of changes.
 *
 * Re-reading immediately before the write means a caller only ever supplies the
 * fields it actually owns, and untouched fields come from the server, not memory.
 */
async function saveWidgetFields(
  slug: string,
  patch: Partial<
    Pick<
      TenantSettings,
      "widgetButtonText" | "widgetColor" | "allowedDomains"
    >
  >,
) {
  const current = await api.businesses.settings(slug);
  return api.businesses.updateWidget(slug, {
    widgetButtonText: current.settings.widgetButtonText,
    widgetColor: current.settings.widgetColor,
    allowedDomains: current.settings.allowedDomains,
    ...patch,
  });
}

const TIMEZONE_OPTIONS = timezoneOptions();

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
  const navigate = useNavigate();
  const { verticals } = useVerticals();
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
  const [notice, setNotice] = useState<Notice | null>(null);

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
            void navigate({ to: nextHref });
          } else {
            setNotice(ok("Business profile saved."));
          }
        } catch (caught) {
          setNotice(fail(caught, "Unable to save the profile."));
        }
      })}
    >
      <Box padding="lg">
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
          <SelectField
            label="Timezone"
            required
            helper="Used for your opening hours and booking times."
            options={TIMEZONE_OPTIONS}
            error={form.formState.errors.timezone?.message}
            {...form.register("timezone")}
          />
          <SelectField
            label="Kind of business"
            helper="Your agent follows the rules that matter in this trade."
            options={verticalOptions(verticals, data.business.vertical)}
            error={form.formState.errors.vertical?.message}
            {...form.register("vertical")}
          />
        </div>
        {notice ? <Alert variant={notice.tone}>{notice.message}</Alert> : null}
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          {nextHref ? "Save and continue →" : "Save profile"}
        </Button>
      </Box>
    </form>
  );
}

/**
 * Picks the agent's voice from the platform catalogue, with a sample of each.
 *
 * The catalogue is server-owned because which voices exist depends on the
 * speech provider the operator configured; `voiceSelectable` is false when that
 * provider is pinned to a single voice, and the picker says so rather than
 * offering a choice that would not take effect.
 */
function VoicePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (voice: string) => void;
}) {
  const [voices, setVoices] = useState<VoiceCatalogueEntry[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api.platform.voices().then(setVoices).catch(() => setVoices([]));
  }, []);

  const preview = (voice: VoiceCatalogueEntry) => {
    const el = audioRef.current;
    if (!el) return;
    if (playing === voice.id) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = voice.preview;
    el.currentTime = 0;
    void el.play().catch(() => setPlaying(null));
    setPlaying(voice.id);
  };

  if (voices.length === 0) return null;

  return (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 18px" }}>
      <legend className="ui-field-label">Voice</legend>
      <p className="ui-field-message" style={{ marginTop: 0 }}>
        Press play to hear a sample of each voice.
      </p>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} hidden />
      <ul className="voice-list">
        {voices.map((voice) => {
          const selected = value === voice.id;
          const isPlaying = playing === voice.id;
          return (
            <li key={voice.id} className="voice-row">
              <button
                type="button"
                onClick={() => onChange(voice.id)}
                className={`voice-row__pick ${selected ? "voice-row__pick--selected" : ""}`}
                aria-pressed={selected}
              >
                <span className="voice-row__desc">{voice.description}</span>
                <span className="voice-row__name">{voice.label}</span>
              </button>
              <button
                type="button"
                className="voice-row__preview"
                onClick={() => preview(voice)}
                aria-pressed={isPlaying}
                aria-label={`${isPlaying ? "Stop" : "Play"} sample of ${voice.label}`}
              >
                {isPlaying ? "\u25a0" : "\u25b6"}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
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
  const navigate = useNavigate();
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
      transferPhone: data.settings.transferPhone ?? "",
    },
  });
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        setNotice(null);
        try {
          await api.businesses.updateAgentSettings(slug, values);
          await onSaved?.();
          if (nextHref) void navigate({ to: nextHref });
          else setNotice(ok("Agent settings saved."));
        } catch (caught) {
          setNotice(fail(caught, "Unable to save agent settings."));
        }
      })}
    >
      <Box padding="lg">
        <h2>Agent</h2>
        <p className="auth-card-copy">
          How your agent introduces itself, sounds, and behaves when it cannot
          help. These settings apply to every call, on the web and on the phone.
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
        </div>
        <VoicePicker
          value={form.watch("voice")}
          onChange={(voice) =>
            form.setValue("voice", voice, { shouldDirty: true })
          }
        />
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
        <TextField
          label="Transfer calls to"
          helper="Optional. On phone calls the agent can put a caller through to this number. Browser callers always get a message taken instead."
          placeholder="+14155550123"
          error={form.formState.errors.transferPhone?.message}
          {...form.register("transferPhone")}
        />
        <label className="ui-check-row">
          <input type="checkbox" {...form.register("allowInterrupt")} />
          <span>
            Allow visitors to interrupt agent speech
            <small>Applied as workflow-level interruption behavior.</small>
          </span>
        </label>
        {notice ? <Alert variant={notice.tone}>{notice.message}</Alert> : null}
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
  const navigate = useNavigate();
  const form = useForm<WidgetValues>({
    resolver: zodResolver(widgetSchema),
    defaultValues: {
      widgetButtonText: data.settings.widgetButtonText,
      widgetColor: data.settings.widgetColor,
      allowedDomains: data.settings.allowedDomains.join("\n"),
    },
  });
  const [notice, setNotice] = useState<Notice | null>(null);
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
          if (nextHref) void navigate({ to: nextHref });
          else setNotice(ok("Widget settings saved."));
        } catch (caught) {
          setNotice(fail(caught, "Unable to save widget settings."));
        }
      })}
    >
      <Box padding="lg">
        <h2>Widget</h2>
        <p className="auth-card-copy">
          Publish a domain-restricted browser voice widget. The embed token is
          public; management credentials remain server-only.
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
        {notice ? <Alert variant={notice.tone}>{notice.message}</Alert> : null}
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

type Day = (typeof days)[number];

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
  nextHref,
  onSaved,
  slug,
}: {
  data: TenantSettingsResponse;
  nextHref?: string;
  onSaved: () => Promise<void>;
  slug: string;
}) {
  const navigate = useNavigate();
  const [hours, setHours] = useState(defaultHours(data.settings.businessHours));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const patchDay = (day: Day, patch: Partial<BusinessHoursDay>) =>
    setHours((current) => ({ ...current, [day]: { ...current[day]!, ...patch } }));

  /**
   * Most businesses keep one schedule across the week, but the grid asked for
   * every day to be typed out separately — seven times over, and again for each
   * location. Copying a row onto the other open days is the whole point of the
   * screen for the common case.
   */
  const copyToOpenDays = (source: Day) => {
    const { open, close } = hours[source]!;
    const targets = days.filter((day) => day !== source && hours[day]!.enabled);
    if (targets.length === 0) {
      setNotice(staged(`No other days are open, so ${source}'s hours had nowhere to go.`));
      return;
    }
    setHours((current) =>
      Object.fromEntries(
        days.map((day) => [
          day,
          day === source || !current[day]!.enabled
            ? current[day]!
            : { ...current[day]!, open, close },
        ]),
      ),
    );
    setNotice(
      staged(
        `${source}'s hours copied to ${targets.length} other open ${
          targets.length === 1 ? "day" : "days"
        }. Save to keep them.`,
      ),
    );
  };

  return (
    <Box padding="lg">
      <h2>Opening hours</h2>
      <p className="auth-card-copy">
        Your agent compares these against the current local time, so it can say
        whether you are open and only offer slots you actually work. Days left
        off are treated as closed.
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
                    patchDay(day, { enabled: event.target.checked })
                  }
                />
                {day}
              </label>
              {entry.enabled ? (
                <>
                  <input
                    aria-label={`${day} opening time`}
                    className="ui-input"
                    type="time"
                    value={entry.open}
                    onChange={(event) => patchDay(day, { open: event.target.value })}
                  />
                  <input
                    aria-label={`${day} closing time`}
                    className="ui-input"
                    type="time"
                    value={entry.close}
                    onChange={(event) => patchDay(day, { close: event.target.value })}
                  />
                  <button
                    aria-label={`Copy ${day}'s hours to every other open day`}
                    className="hours-row__copy"
                    onClick={() => copyToOpenDays(day)}
                    title={`Copy ${day}'s hours to every other open day`}
                    type="button"
                  >
                    <CopyIcon size={16} />
                  </button>
                </>
              ) : (
                <span className="hours-row__closed">Closed</span>
              )}
            </div>
          );
        })}
      </div>
      {notice ? <Alert variant={notice.tone}>{notice.message}</Alert> : null}
      <Button
        variant="primary"
        loading={saving}
        onClick={() => {
          setSaving(true);
          setNotice(null);
          void api.businesses
            .updateHours(slug, hours)
            .then(onSaved)
            .then(() => {
              if (nextHref) void navigate({ to: nextHref });
              else setNotice(ok("Opening hours saved."));
            })
            .catch((caught: unknown) =>
              setNotice(fail(caught, "Unable to save business hours.")),
            )
            .finally(() => setSaving(false));
        }}
      >
        {nextHref ? "Save and continue \u2192" : "Save hours"}
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
  const navigate = useNavigate();
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
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.businesses.knowledge(slug);
      setItems(result.knowledge);
      setHasMore(result.hasMore);
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

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const result = await api.businesses.knowledge(slug, items.length);
      setItems((prev) => [...prev, ...result.knowledge]);
      setHasMore(result.hasMore);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load more.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [slug, items.length]);

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
      <Box padding="lg">
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
      <Box padding="lg">
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
                        onClick={() =>
                          setDeleteTarget({ id: item.id, title: item.title })
                        }
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
            {hasMore ? (
              <Button
                variant="ghost"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </div>
        )}
      </Box>
      {onboardingNextHref ? (
        <Box padding="lg">
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
                .then(() => navigate({ to: onboardingNextHref }))
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
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        titleId="delete-knowledge-title"
      >
        <h2 id="delete-knowledge-title">Delete knowledge?</h2>
        <p>
          {deleteTarget
            ? `"${deleteTarget.title}" will be removed from the agent's context. This cannot be undone.`
            : null}
        </p>
        <div className="stack-row">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={deleting}
            onClick={async () => {
              if (!deleteTarget) return;
              setError(null);
              setDeleting(true);
              try {
                await api.businesses.deleteKnowledge(slug, deleteTarget.id);
                await refresh();
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Unable to delete knowledge.",
                );
              } finally {
                setDeleting(false);
                setDeleteTarget(null);
              }
            }}
          >
            Delete knowledge
          </Button>
        </div>
      </Modal>
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
      {tab === "gaps" ? <GapsTab slug={slug} /> : null}
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
        (await api.businesses.knowledge(slug)).knowledge.filter(
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
      <Box padding="lg">
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

function relativeTime(value: string): string {
  const elapsed = Date.now() - Date.parse(value);
  if (Number.isNaN(elapsed) || elapsed < 0) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function GapsTab({ slug }: { slug: string }) {
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.businesses.knowledgeGaps(slug);
      setGaps(result.gaps);
      setCanManage(result.canManage);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load gaps.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = gaps.filter((gap) => gap.status === "open");
  const resolvedCount = gaps.length - open.length;

  async function answerGap(gap: KnowledgeGap) {
    if (!answer.trim()) {
      setError("Write what the agent should say.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.businesses.createKnowledge(slug, {
        kind: "text",
        title: gap.question,
        text: answer,
        retrievalMode: "full_document",
      });
      await api.businesses.updateKnowledgeGap(slug, gap.id, "answered");
      setAnsweringId(null);
      setAnswer("");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save the answer.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function dismissGap(gap: KnowledgeGap) {
    setError(null);
    try {
      await api.businesses.updateKnowledgeGap(slug, gap.id, "dismissed");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to dismiss the gap.",
      );
    }
  }

  return (
    <div className="settings-stack">
      <Box padding="lg">
        <h2>Asked, and the agent had nothing</h2>
        <p className="auth-card-copy">
          Pulled straight out of conversations. Answer one and it leaves this
          queue — the answer reaches callers after the next publish.
        </p>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {loading ? (
          <LoadingState label="Loading gaps…" />
        ) : open.length === 0 ? (
          <EmptyState title="No open gaps">
            {resolvedCount > 0
              ? `Every unanswered question has been handled (${resolvedCount} resolved).`
              : "When callers ask something the agent cannot answer, it shows up here."}
          </EmptyState>
        ) : (
          <div className="knowledge-list">
            {open.map((gap) => (
              <div className="knowledge-item" key={gap.id}>
                <div className="knowledge-row">
                  <div>
                    <strong>“{gap.question}”</strong>
                    <span>
                      Asked {gap.askCount}×, last {relativeTime(gap.lastAskedAt)}
                    </span>
                  </div>
                  <Pill variant="warn">No answer</Pill>
                </div>
                {gap.agentResponse ? (
                  <div className="knowledge-preview">
                    <p className="knowledge-preview__label">
                      What the agent said instead
                    </p>
                    <pre>{gap.agentResponse}</pre>
                  </div>
                ) : null}
                {canManage ? (
                  answeringId === gap.id ? (
                    <div className="answer-editor">
                      <TextArea
                        label="What the agent should say"
                        required
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                      />
                      <div className="stack-row">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setAnsweringId(null);
                            setAnswer("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          loading={saving}
                          onClick={() => void answerGap(gap)}
                        >
                          Save answer
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="stack-row">
                      <Button
                        variant="ghost"
                        onClick={() => void dismissGap(gap)}
                      >
                        Dismiss
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => {
                          setAnsweringId(gap.id);
                          setAnswer("");
                        }}
                      >
                        Answer it
                      </Button>
                    </div>
                  )
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Box>
    </div>
  );
}

/**
 * Lets an owner call their own agent from the dashboard before they put it in
 * front of customers. It drives the same published widget a visitor gets, in
 * headless mode, so what they hear here is exactly what a caller hears.
 */
function BrowserTestCall({ widget }: { widget: TenantWidget }) {
  const [status, setStatus] = useState<VoiceWidgetStatus>("idle");
  const [detail, setDetail] = useState(
    "Call your agent the way a visitor would, and hear exactly what they hear.",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    return () => {
      window.VocalonixWidget?.end();
      document.getElementById("vocalonix-tenant-widget-script")?.remove();
    };
  }, []);

  const bind = () => {
    const instance = window.VocalonixWidget;
    if (!instance) return;
    instance.onStatusChange(({ status: next, detail: message }) => {
      setStatus(next);
      if (message) setDetail(message);
      if (next !== "failed") setError(null);
    });
    instance.onError((value) => {
      setError(
        value instanceof Error
          ? value.message
          : "The call could not be started. Check microphone access and try again.",
      );
    });
  };

  const startCall = () => {
    setError(null);
    setLoading(true);
    if (loadedRef.current && window.VocalonixWidget) {
      window.VocalonixWidget.start();
      setLoading(false);
      return;
    }
    const script = document.createElement("script");
    script.id = "vocalonix-tenant-widget-script";
    // `headless` keeps the widget's own launcher off this page — the dashboard
    // supplies the controls, the widget supplies the call.
    script.src = `${widget.scriptUrl}&headless=1`;
    script.async = true;
    script.onload = () => {
      loadedRef.current = true;
      setLoading(false);
      bind();
      window.VocalonixWidget?.start();
    };
    script.onerror = () => {
      setLoading(false);
      setError("The published widget could not be loaded. Republish and try again.");
    };
    document.body.appendChild(script);
  };

  const live = status === "listening" || status === "speaking";
  const label: Record<VoiceWidgetStatus, string> = {
    idle: "Ready to call",
    connecting: "Connecting…",
    listening: "Connected — say hello",
    speaking: "Your agent is speaking",
    ended: "Call ended",
    failed: "Call failed",
  };

  return (
    <Box padding="md">
      <h2>Try your agent</h2>
      <p className="auth-card-copy">{label[status]}</p>
      <p className="ui-field-message" style={{ marginTop: -6 }}>
        {detail}
      </p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Button
          variant="accent"
          loading={loading}
          disabled={live || status === "connecting"}
          onClick={startCall}
        >
          {status === "failed" ? "Try again" : "Start a test call"}
        </Button>
        <Button
          variant="ghost"
          disabled={!live && status !== "connecting"}
          onClick={() => window.VocalonixWidget?.end()}
        >
          End call
        </Button>
      </div>
      <p className="ui-field-message">
        This is a real call against your published agent. It appears in
        Conversations like any other.
      </p>
    </Box>
  );
}

/**
 * The plan step.
 *
 * Free is a real, complete choice here rather than a way of skipping the step:
 * a workspace on Free publishes and answers calls, it just answers fewer of
 * them. So the step is satisfied either way, and nobody is pushed through a
 * card form to finish setting up.
 */
function PlanStep({
  slug,
  nextHref,
}: {
  slug: string;
  nextHref: string;
}) {
  const navigate = useNavigate();
  const { pricing, error: pricingError } = usePricing();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  useEffect(() => {
    void api.billing
      .status(slug)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [slug]);

  // Coming back from Stripe. The webhook is what actually grants the plan, so
  // this only records that the choice was made and tells the customer where
  // they are — it never trusts the query string for entitlement.
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get("checkout");
    if (!outcome) return;
    if (outcome === "success") {
      setNotice({
        tone: "success",
        message:
          "Payment received. Your new plan applies as soon as Stripe confirms it — usually within a few seconds.",
      });
      void api.businesses.completePlanOnboarding(slug).catch(() => undefined);
    } else if (outcome === "cancelled") {
      setNotice({
        tone: "info",
        message: "Checkout cancelled. You can carry on with the free plan.",
      });
    }
  }, [slug]);

  async function continueOnFree() {
    setBusyPlanId("free");
    try {
      await api.businesses.completePlanOnboarding(slug);
      await navigate({ to: nextHref });
    } catch {
      setNotice({
        tone: "error",
        message: "That could not be saved. Please try again.",
      });
    } finally {
      setBusyPlanId(null);
    }
  }

  async function upgrade(planId: string) {
    setBusyPlanId(planId);
    setNotice(null);
    try {
      const { url } = await api.billing.checkout(slug, planId, "onboarding");
      window.location.href = url;
    } catch (caught) {
      setNotice({
        tone: "error",
        message:
          caught instanceof ApiClientError
            ? caught.message
            : "Checkout could not be started. Please try again.",
      });
      setBusyPlanId(null);
    }
  }

  return (
    <div className="onboarding-step">
      <header className="onboarding-step__header">
        <h2>Choose how much it answers</h2>
        <p>
          Every plan does the same job — the difference is how many minutes it
          spends talking, and whether it answers a phone number. You can change
          this at any time, and nothing here blocks you from publishing.
        </p>
      </header>

      {notice ? <Alert variant={notice.tone}>{notice.message}</Alert> : null}
      {pricingError ? (
        <Alert variant="error">
          Plans could not be loaded. You can continue on the free plan and
          choose later from Account &amp; billing.
        </Alert>
      ) : null}

      {!pricing && !pricingError ? (
        <LoadingState label="Loading plans…" />
      ) : null}

      {pricing ? (
        <PlanGrid
          plans={pricing.plans}
          currentPlanId={status?.plan.id}
          action={(plan) =>
            plan.amountCents === 0 ? (
              <Button
                loading={busyPlanId === "free"}
                onClick={() => void continueOnFree()}
              >
                Continue on Free
              </Button>
            ) : (
              <Button
                variant={plan.highlighted ? "primary" : undefined}
                loading={busyPlanId === plan.id}
                disabled={!plan.purchasable || !status?.configured}
                onClick={() => void upgrade(plan.id)}
              >
                {plan.purchasable && status?.configured
                  ? `Choose ${plan.name}`
                  : "Not available yet"}
              </Button>
            )
          }
        />
      ) : null}

      {pricing && !pricing.billingEnabled ? (
        <p className="auth-card-copy">
          Card payments are not switched on for this deployment yet. Continue on
          the free plan — we can move you onto a paid plan directly.
        </p>
      ) : null}

      <div className="stack-row">
        <Button
          variant="ghost"
          onClick={() => void continueOnFree()}
          loading={busyPlanId === "free"}
        >
          Skip for now →
        </Button>
      </div>
    </div>
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
      <Box padding="lg">
        <h2>Review and publish</h2>
        <p className="auth-card-copy">
          Publishing puts this agent on {data.business.name}&apos;s website. From
          then on it answers visitors using the answers and prices below.
        </p>
        <div className="review-grid">
          <span>Agent</span>
          <strong>{data.settings.agentName}</strong>
          <span>Knowledge</span>
          <strong>Your saved answers and prices</strong>
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
          <Box padding="md">
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
              <Box padding="xl" style={{ textAlign: "center" }}>
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
                nextHref={`/app/${slug}/onboarding/hours`}
              />
            ) : null}
            {step === "hours" ? (
              <HoursForm
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
                nextHref={`/app/${slug}/onboarding/plan`}
              />
            ) : null}
            {step === "plan" ? (
              <PlanStep
                slug={slug}
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
  transferPhone: { label: "Transfer calls to", section: "Agent" },
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
          <Link to="/app/$businessSlug/settings/history" params={{ businessSlug: slug }}>View history</Link>
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
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <div className="config-columns">
      <Box padding="lg">
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
          <Alert variant={notice.tone}>{notice.message}</Alert>
        ) : null}
        <Button
          variant="primary"
          loading={saving}
          onClick={() => {
            setSaving(true);
            setNotice(null);
            void saveWidgetFields(slug, {
              widgetButtonText: label,
              widgetColor: color,
            })
              .then(onSaved)
              .then(() => setNotice(ok("Appearance saved.")))
              .catch((caught: unknown) =>
                setNotice(fail(caught, "Unable to save appearance.")),
              )
              .finally(() => setSaving(false));
          }}
        >
          Save appearance
        </Button>
      </Box>
      <Box tone="tinted" padding="lg">
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
  const [notice, setNotice] = useState<Notice | null>(null);
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
      <Box padding="lg">
        <h2>Where it may load</h2>
        <TextArea
          label="Allowed domains"
          helper="One hostname per line. Empty means any site can load your widget."
          value={domains}
          readOnly={!canEdit}
          onChange={(event) => setDomains(event.target.value)}
        />
        {notice ? (
          <Alert variant={notice.tone}>{notice.message}</Alert>
        ) : null}
        {canEdit ? (
          <Button
            variant="primary"
            loading={saving}
            onClick={() => {
              setSaving(true);
              setNotice(null);
              void saveWidgetFields(slug, {
                allowedDomains: domains
                  .split(/\r?\n|,/)
                  .map((domain) => domain.trim())
                  .filter(Boolean),
              })
                .then(refresh)
                .then(() => setNotice(ok("Widget settings saved.")))
                .catch((caught: unknown) =>
                  setNotice(fail(caught, "Unable to save widget settings.")),
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
          <Box padding="lg">
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
  const [notice, setNotice] = useState<Notice | null>(null);

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
        transferPhone: config.transferPhone ?? "",
      });
      await api.businesses.updateHours(slug, config.businessHours);
      await api.businesses.updateWidget(slug, {
        widgetButtonText: config.widgetButtonText,
        widgetColor: config.widgetColor,
        allowedDomains: config.allowedDomains,
      });
      await refresh();
      setNotice(ok(`Version ${version.version} restored into your draft. Republish to make it live.`));
      setConfirming(null);
    } catch (caught) {
      setNotice(fail(caught, "Unable to restore this version."));
    } finally {
      setRestoring(false);
    }
  }

  if (loading) return <LoadingState label="Loading history…" />;

  return (
    <div className="settings-stack">
      <Box padding="lg">
        <h2>Every version that answered a call</h2>
        <p className="auth-card-copy">
          Restoring writes into your draft. Callers hear it only once you republish.
        </p>
        {notice ? (
          <Alert variant={notice.tone}>{notice.message}</Alert>
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

function releasedOn(iso: string | null): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Numbers the platform already holds that nobody is answering on.
 *
 * Offered above the search because reconnecting one costs nothing extra and is
 * instant, where buying adds another line to the bill. A workspace sees its own
 * released numbers by name and date; other workspaces' numbers are offered
 * without saying whose they were.
 */
function PooledNumbers({
  claiming,
  label,
  loading,
  numbers,
  onClaim,
  onLoad,
}: {
  claiming: string | null;
  label: string;
  loading: boolean;
  numbers: PooledNumber[] | null;
  onClaim: (e164: string) => Promise<void>;
  onLoad: () => Promise<void>;
}) {
  useEffect(() => {
    if (numbers === null && !loading) void onLoad();
  }, [numbers, loading, onLoad]);

  if (loading && numbers === null) {
    return <LoadingState label="Checking for numbers you already have…" />;
  }
  // Nothing parked is the normal case, and an empty box explaining that would
  // only be in the way of buying one.
  if (!numbers || numbers.length === 0) return null;

  return (
    <div className="phone-pool">
      <h3>Numbers you can reconnect</h3>
      <p className="ui-field-message">
        Already paid for. Connecting one is instant and adds nothing to your
        bill.
      </p>
      <ul className="phone-list phone-list--available">
        {numbers.map((row) => (
          <li key={row.e164} className="phone-row">
            <div>
              <strong className="phone-row__number">{row.e164}</strong>
              <div className="ui-field-message">
                {row.previousUse === "yours"
                  ? `You released this${
                      releasedOn(row.releasedAt)
                        ? ` on ${releasedOn(row.releasedAt)}`
                        : ""
                    }.`
                  : row.previousUse === "other"
                    ? "Previously used by another business."
                    : "Never connected to an agent."}
              </div>
            </div>
            <Button
              variant="accent"
              loading={claiming === row.e164}
              disabled={claiming !== null && claiming !== row.e164}
              onClick={() => {
                void onClaim(row.e164);
              }}
            >
              {label.trim() ? "Connect this number" : "Connect"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Connects a real phone number to this agent.
 *
 * Numbers live with the telephony provider; this page only claims one for the
 * workspace and points inbound calls at its published workflow. The provider
 * credentials never reach the browser.
 */
function PhoneTab({
  canEdit,
  data,
  slug,
}: {
  canEdit: boolean;
  data: TenantSettingsResponse;
  slug: string;
}) {
  const [phone, setPhone] = useState<BusinessPhoneResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [label, setLabel] = useState("");
  const [results, setResults] = useState<AvailableNumber[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseTarget, setReleaseTarget] =
    useState<BusinessPhoneNumber | null>(null);
  const [releasePassword, setReleasePassword] = useState("");
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [pool, setPool] = useState<PooledNumber[] | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPhone(await api.businesses.phone(slug));
    } catch (caught) {
      setNotice(fail(caught, "Could not load phone numbers."));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  /**
   * The pool is a live provider read, so it is fetched only when the picker is
   * actually on screen rather than with the rest of the tab.
   */
  const loadPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      setPool((await api.businesses.pooledNumbers(slug)).numbers);
    } catch {
      // A pool that will not load must not break buying a new number, which is
      // the path that always works. It simply stays hidden.
      setPool([]);
    } finally {
      setPoolLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const published = Boolean(data.onboarding.publishedAt);

  if (loading) return <LoadingState label="Loading phone numbers…" />;

  return (
    <div className="settings-stack">
      <Box padding="lg">
        <h2>Phone number</h2>
        <p className="auth-card-copy">
          Point a number at {data.settings.agentName} and it answers every call
          on it — the same agent, the same knowledge, the same diary.
        </p>

        {phone && !phone.available ? (
          <Alert variant="warn">
            {phone.unavailableReason ??
              "Phone numbers are not switched on for this platform yet."}
          </Alert>
        ) : null}

        {/* Said here rather than at the moment of purchase. Letting somebody
            search numbers, pick one they like and only then meet a 402 is a
            worse way to learn what their plan includes. */}
        {phone && phone.available && !phone.phoneIncluded ? (
          <Alert variant="info">
            The {phone.planName} plan answers on your website only. Move up a
            plan and this agent gets a number of its own, with warm transfer and
            outbound callbacks.{" "}
            <Link to="/app/$businessSlug/account" params={{ businessSlug: slug }}>
              See plans
            </Link>
          </Alert>
        ) : null}

        {!published ? (
          <Alert variant="warn">
            Publish this agent first — a number can only be pointed at a live
            agent.
          </Alert>
        ) : null}

        {notice ? <Alert variant={notice.tone}>{notice.message}</Alert> : null}

        {phone && phone.numbers.length > 0 ? (
          <ul className="phone-list">
            {phone.numbers.map((row) => (
              <li key={row.id} className="phone-row">
                <div>
                  <strong className="phone-row__number">{row.e164}</strong>
                  {row.label ? (
                    <span className="phone-row__label"> · {row.label}</span>
                  ) : null}
                  <div className="ui-field-message">
                    {row.status === "active"
                      ? `Answering as ${data.settings.agentName}.`
                      : (row.lastError ??
                        "Waiting for the telephony provider to confirm.")}
                  </div>
                </div>
                <div className="stack-row">
                  <Pill variant={row.status === "active" ? "accent" : "warn"}>
                    {row.status === "active" ? "Live" : row.status}
                  </Pill>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setReleaseTarget(row);
                        setReleasePassword("");
                        setReleaseError(null);
                        setNotice(null);
                      }}
                    >
                      Release
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : phone?.phoneIncluded === false ? null : (
          <EmptyState title="No phone number yet">
            Pick a number below and it is yours — we buy it and point it at this
            agent. Nothing to set up with a phone company.
          </EmptyState>
        )}

        {canEdit &&
        phone?.available &&
        phone.phoneIncluded &&
        published &&
        !phone.atNumberLimit ? (
          <div className="phone-picker">
            <PooledNumbers
              claiming={claiming}
              label={label}
              loading={poolLoading}
              numbers={pool}
              onLoad={loadPool}
              onClaim={async (e164) => {
                setClaiming(e164);
                setNotice(null);
                try {
                  await api.businesses.attachPhone(slug, { number: e164, label });
                  setResults(null);
                  setPool(null);
                  setLabel("");
                  await load();
                  setNotice(ok("Number is yours. Give it a call."));
                } catch (caught) {
                  setNotice(fail(caught, "Could not connect that number."));
                } finally {
                  setClaiming(null);
                }
              }}
            />
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setSearching(true);
                setNotice(null);
                try {
                  const found = await api.businesses.availableNumbers(slug, {
                    country,
                    areaCode: areaCode.trim() || undefined,
                  });
                  setResults(found.numbers);
                  if (found.numbers.length === 0) {
                    // Not an error — the search worked, the inventory is just
                    // empty for that filter.
                    setNotice({
                      tone: "info",
                      message: "No numbers matched. Try a different area code.",
                    });
                  }
                } catch (caught) {
                  setNotice(fail(caught, "Could not load available numbers."));
                } finally {
                  setSearching(false);
                }
              }}
            >
              <div className="form-grid">
                <SelectField
                  label="Country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  options={[
                    { value: "US", label: "United States" },
                    { value: "CA", label: "Canada" },
                    { value: "GB", label: "United Kingdom" },
                    { value: "AU", label: "Australia" },
                  ]}
                />
                <TextField
                  label="Area code"
                  placeholder="415"
                  helper="Optional. Leave blank to see any area."
                  value={areaCode}
                  onChange={(event) => setAreaCode(event.target.value)}
                />
                <TextField
                  label="Label"
                  placeholder="Main line"
                  helper="What you'll call this number internally."
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </div>
              <Button type="submit" loading={searching}>
                Search numbers
              </Button>
            </form>

            {results && results.length > 0 ? (
              <ul className="phone-list phone-list--available">
                {results.map((row) => (
                  <li key={row.e164} className="phone-row">
                    <div>
                      <strong className="phone-row__number">{row.e164}</strong>
                      <div className="ui-field-message">
                        {[row.locality, row.region].filter(Boolean).join(", ") ||
                          row.countryCode}
                        {row.monthlyCost
                          ? ` · ${row.monthlyCost} ${row.currency ?? ""}/month`
                          : ""}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      loading={claiming === row.e164}
                      disabled={claiming !== null && claiming !== row.e164}
                      onClick={async () => {
                        setClaiming(row.e164);
                        setNotice(null);
                        try {
                          await api.businesses.attachPhone(slug, {
                            number: row.e164,
                            label,
                          });
                          setResults(null);
                          setLabel("");
                          await load();
                          setNotice(ok("Number is yours. Give it a call."));
                        } catch (caught) {
                          setNotice(fail(caught, "Could not get that number."));
                        } finally {
                          setClaiming(null);
                        }
                      }}
                    >
                      Get this number
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {canEdit && phone?.atNumberLimit ? (
          <p className="ui-field-message">
            Each agent answers one number. Release this one to choose a
            different number.
          </p>
        ) : null}
      </Box>

      <Modal
        open={releaseTarget !== null}
        onClose={() => setReleaseTarget(null)}
        titleId="release-number-title"
        descriptionId="release-number-copy"
      >
        <h2 id="release-number-title">
          Release {releaseTarget?.e164}?
        </h2>
        <div id="release-number-copy">
          <p>
            {data.settings.agentName} stops answering on this number
            straight away. Callers who dial it will not reach you.
          </p>
          <ul className="plain-list">
            <li>
              The number stays reserved for you — nobody outside Harkbell can
              take it, and you can connect it again later.
            </li>
            <li>Calls already logged in Conversations are kept.</li>
          </ul>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!releaseTarget) return;
            setReleasing(true);
            setReleaseError(null);
            try {
              await api.businesses.releasePhone(
                slug,
                releaseTarget.id,
                releasePassword,
              );
              setReleaseTarget(null);
              setReleasePassword("");
              setPool(null);
              await load();
              setNotice(ok("Number released. You can connect it again any time."));
            } catch (caught) {
              // Shown inside the modal, not as a page notice: the person is
              // still in the dialog and the fix is right there.
              setReleaseError(
                caught instanceof Error
                  ? caught.message
                  : "Could not release the number.",
              );
            } finally {
              setReleasing(false);
            }
          }}
        >
          <TextField
            label="Confirm your password"
            type="password"
            autoComplete="current-password"
            helper="Releasing a number cannot be undone from here."
            value={releasePassword}
            onChange={(event) => setReleasePassword(event.target.value)}
          />
          {releaseError ? <Alert variant="error">{releaseError}</Alert> : null}
          <div className="stack-row">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setReleaseTarget(null)}
            >
              Keep the number
            </Button>
            <Button
              type="submit"
              variant="destructive"
              loading={releasing}
              disabled={releasePassword.length === 0}
            >
              Release number
            </Button>
          </div>
        </form>
      </Modal>

      <Box padding="md">
        <h3>What changes on a phone call</h3>
        <ul className="plain-list">
          <li>
            The agent knows it is on the phone, and asks for a number to call
            back on rather than assuming it has one.
          </li>
          <li>
            {data.settings.transferPhone
              ? `It can put callers through to ${data.settings.transferPhone} when they ask for a person.`
              : "Set a transfer number on the Agent tab and it can put callers through to a person."}
          </li>
          <li>Calls appear in Conversations alongside web calls.</li>
        </ul>
      </Box>
    </div>
  );
}

const configTabs = [
  { slug: "business", label: "Business" },
  { slug: "agent", label: "Agent" },
  { slug: "hours", label: "Hours" },
  { slug: "phone", label: "Phone" },
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
                {section === "phone" ? (
                  <PhoneTab canEdit={canEditAgent} data={data} slug={slug} />
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
              </div>
            );
          }}
        </ConfigurationState>
      )}
    </WorkspaceShell>
  );
}
