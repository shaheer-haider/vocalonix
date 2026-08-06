import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "@tanstack/react-router";

import { api } from "../api";
import {
  Alert,
  Box,
  Button,
  Pill,
  SelectField,
  TextArea,
  TextField,
} from "../components/ui";
import { AuthShell } from "../components/shell";
import { useDograhHealth } from "../hooks/useDograhHealth";
import type {
  DemoSession,
  DemoStartResponse,
  DograhWidget,
  Vertical,
} from "../types";

type Step =
  | "vertical"
  | "business"
  | "intake"
  | "voice"
  | "live"
  | "feedback"
  | "thanks";

interface StoredDemo {
  savedAt: string;
  step: Step;
  sessionId: string;
  draft: Partial<DemoSession>;
  call: DemoStartResponse | null;
}

const STORAGE_KEY = "vocalonix-demo";
const DEMO_TTL_MS = 24 * 60 * 60 * 1000;
const CALL_DURATION_SECONDS = 60;
const TOTAL_STEPS = 7;

const VOICES = [
  { value: "zephyr", name: "Zephyr", desc: "Bright · higher pitch" },
  { value: "puck", name: "Puck", desc: "Upbeat · middle pitch" },
  { value: "charon", name: "Charon", desc: "Informative · lower pitch" },
  { value: "kore", name: "Kore", desc: "Firm · middle pitch" },
  { value: "fenrir", name: "Fenrir", desc: "Excitable · lower-middle pitch" },
  { value: "leda", name: "Leda", desc: "Youthful · higher pitch" },
  { value: "orus", name: "Orus", desc: "Firm · lower-middle pitch" },
  { value: "aoede", name: "Aoede", desc: "Breezy · middle pitch" },
  { value: "callirrhoe", name: "Callirrhoe", desc: "Easy-going · middle pitch" },
  { value: "autonoe", name: "Autonoe", desc: "Bright · middle pitch" },
  { value: "enceladus", name: "Enceladus", desc: "Breathy · lower pitch" },
  { value: "iapetus", name: "Iapetus", desc: "Clear · lower-middle pitch" },
  { value: "umbriel", name: "Umbriel", desc: "Easy-going · lower-middle pitch" },
  { value: "algieba", name: "Algieba", desc: "Smooth · lower pitch" },
  { value: "despina", name: "Despina", desc: "Smooth · middle pitch" },
  { value: "erinome", name: "Erinome", desc: "Clear · middle pitch" },
  { value: "algenib", name: "Algenib", desc: "Gravelly · lower pitch" },
  { value: "rasalgethi", name: "Rasalgethi", desc: "Informative · middle pitch" },
  { value: "laomedeia", name: "Laomedeia", desc: "Upbeat · higher pitch" },
  { value: "achernar", name: "Achernar", desc: "Soft · higher pitch" },
  { value: "alnilam", name: "Alnilam", desc: "Firm · lower-middle pitch" },
  { value: "schedar", name: "Schedar", desc: "Even · lower-middle pitch" },
  { value: "gacrux", name: "Gacrux", desc: "Mature · middle pitch" },
  { value: "pulcherrima", name: "Pulcherrima", desc: "Forward · middle pitch" },
  { value: "achird", name: "Achird", desc: "Friendly · lower-middle pitch" },
  { value: "zubenelgenubi", name: "Zubenelgenubi", desc: "Casual · lower-middle pitch" },
  { value: "vindemiatrix", name: "Vindemiatrix", desc: "Gentle · middle pitch" },
  { value: "sadachbia", name: "Sadachbia", desc: "Lively · lower pitch" },
  { value: "sadaltager", name: "Sadaltager", desc: "Knowledgeable · middle pitch" },
  { value: "sulafat", name: "Sulafat", desc: "Warm · middle pitch" },
];

const FEEDBACK_CHIPS = [
  "Sounded natural",
  "Too robotic",
  "Didn't answer my question",
  "Too slow",
  "Too fast",
  "Loved the voice",
  "Would book from this",
];

function saveToStorage(state: StoredDemo) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be disabled in private browsing.
  }
}

function loadFromStorage(): StoredDemo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredDemo;
  } catch {
    return null;
  }
}

function isExpired(savedAt: string) {
  return Date.now() - new Date(savedAt).getTime() > DEMO_TTL_MS;
}

function emptyDraft(): Partial<DemoSession> {
  return {
    services: [],
    verticalAnswers: {},
    demoMode: "browser",
    voice: "zephyr",
  };
}

function formatTitle(step: Step) {
  switch (step) {
    case "vertical":
      return "Pick your industry";
    case "business":
      return "Business basics";
    case "intake":
      return "A few details";
    case "voice":
      return "Pick a voice";
    case "live":
      return "Live demo call";
    case "feedback":
      return "How did it go?";
    case "thanks":
      return "Thanks for trying Vocalonix";
  }
}

function formatStepNumber(step: Step) {
  const map: Record<Step, number> = {
    vertical: 1,
    business: 2,
    intake: 3,
    voice: 4,
    live: 5,
    feedback: 6,
    thanks: 7,
  };
  return map[step];
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function ChoiceButton({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-button ${selected ? "ui-button--primary" : ""}`}
      style={{
        justifyContent: "flex-start",
        borderColor: selected ? "var(--accent)" : undefined,
      }}
    >
      {children}
    </button>
  );
}

function ToggleGroup({
  options,
  values,
  onChange,
}: {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const toggle = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => (
        <ChoiceButton
          key={option}
          selected={values.includes(option)}
          onClick={() => toggle(option)}
        >
          {option}
        </ChoiceButton>
      ))}
    </div>
  );
}

function DemoHeader({
  step,
  title,
  onBack,
  backLabel,
}: {
  step: Step;
  title: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  const back =
    step === "vertical" ? (
      <Link
        to="/"
        className="ui-button ui-button--ghost"
        style={{ paddingLeft: 0 }}
      >
        ← Home
      </Link>
    ) : onBack ? (
      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        style={{ paddingLeft: 0 }}
      >
        ← {backLabel ?? "Back"}
      </Button>
    ) : (
      <span />
    );

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        {back}
        {step !== "thanks" ? (
          <span className="eyebrow">
            Step {formatStepNumber(step)} of {TOTAL_STEPS}
          </span>
        ) : (
          <span className="eyebrow">Done</span>
        )}
        {step === "live" ? (
          <Pill variant="accent">Live call</Pill>
        ) : (
          <span />
        )}
      </div>
      <h1 style={{ fontSize: 24, margin: 0 }}>{title}</h1>
    </div>
  );
}

function LiveCall({
  call,
  onEnd,
}: {
  call: DemoStartResponse;
  onEnd: (durationSeconds: number) => void;
}) {
  const [status, setStatus] = useState<string>("idle");
  const [widgetReady, setWidgetReady] = useState(false);
  const [seconds, setSeconds] = useState(CALL_DURATION_SECONDS);
  const [callError, setCallError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const loadedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      (window as unknown as { DograhWidget?: DograhWidget }).DograhWidget?.end();
    };
  }, []);

  const bindCallbacks = useCallback((widget: DograhWidget) => {
    widget.onStatusChange((s) => {
      setStatus(s);
      if (s === "connected" || s === "connecting") setCallError(null);
    });
    widget.onError((err) => {
      setCallError(
        err instanceof Error ? err.message : String(err ?? "Call failed"),
      );
    });
    setStatus(widget.getState().connectionStatus);
    setWidgetReady(true);
  }, []);

  const unloadWidget = () => {
    document.getElementById("dograh-widget-script")?.remove();
    document.getElementById("dograh-widget-audio")?.remove();
    delete (window as unknown as { DograhWidget?: DograhWidget }).DograhWidget;
  };

  useEffect(() => {
    const global = window as unknown as { DograhWidget?: DograhWidget };
    if (global.DograhWidget && loadedTokenRef.current === call.token) {
      bindCallbacks(global.DograhWidget);
      return;
    }
    if (global.DograhWidget) unloadWidget();

    const script = document.createElement("script");
    script.id = "dograh-widget-script";
    script.src = call.scriptUrl;
    script.async = true;
    script.onload = () => {
      loadedTokenRef.current = call.token;
      if (global.DograhWidget) bindCallbacks(global.DograhWidget);
    };
    script.onerror = () => setCallError("Could not load the call widget.");
    document.body.appendChild(script);
  }, [call, bindCallbacks]);

  useEffect(() => {
    if (status !== "connected") return;
    setStartedAt(Date.now());
    const interval = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(interval);
          endCall();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [status]);

  const endCall = () => {
    const widget = (window as unknown as { DograhWidget?: DograhWidget })
      .DograhWidget;
    if (widget) widget.end();
    const duration = startedAt
      ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      : 0;
    onEnd(duration);
  };

  const start = () => {
    const widget = (window as unknown as { DograhWidget?: DograhWidget })
      .DograhWidget;
    if (!widget) return;
    setCallError(null);
    widget.start();
  };

  const inCall = status === "connecting" || status === "connected";
  const statusCopy: Record<string, string> = {
    idle: "Ready to call",
    connecting: "Connecting…",
    connected: "Connected — say hello",
    failed: "Call failed",
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Pill
            variant={
              status === "connected"
                ? "good"
                : status === "failed"
                  ? "warn"
                  : "default"
            }
          >
            {statusCopy[status] ?? status}
          </Pill>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 14,
              minWidth: 44,
              textAlign: "center",
            }}
          >
            {formatTime(seconds)}
          </span>
        </div>
        <Button
          variant={inCall ? "destructive" : "primary"}
          onClick={inCall ? endCall : start}
          disabled={!widgetReady || Boolean(callError)}
        >
          {inCall ? "End call" : "Start call"}
        </Button>
      </div>

      <Box style={{ padding: 16, marginBottom: 16 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          Try saying one of these
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {call.suggestedScripts.map((script) => (
            <li key={script} style={{ marginBottom: 6 }}>
              {script}
            </li>
          ))}
        </ul>
      </Box>

      {status === "idle" ? (
        <Box tone="tinted" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
            Allow microphone access, then click <strong>Start call</strong>.
            The call runs for up to {CALL_DURATION_SECONDS} seconds.
          </p>
        </Box>
      ) : null}

      {callError ? (
        <div style={{ marginTop: 12 }}>
          <Alert variant="warn">{callError}</Alert>
        </div>
      ) : null}
    </div>
  );
}

function VerticalStep({
  verticals,
  loading,
  onSelect,
}: {
  verticals: Vertical[];
  loading: boolean;
  onSelect: (vertical: Vertical) => void;
}) {
  return (
    <div>
      <p style={{ color: "var(--ink-3)", marginBottom: 18 }}>
        Pick the industry closest to your business. We&apos;ll build a
        one-minute demo from your details.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {verticals.map((v) => (
          <button
            key={v.slug}
            type="button"
            disabled={v.status !== "live" || loading}
            onClick={() => onSelect(v)}
            className="ui-button"
            style={{
              justifyContent: "flex-start",
              alignItems: "flex-start",
              flexDirection: "column",
              minHeight: 80,
              textAlign: "left",
              opacity: v.status === "live" ? 1 : 0.5,
            }}
          >
            <span style={{ fontSize: 20, marginBottom: 4 }}>{v.icon}</span>
            <span style={{ fontWeight: 600 }}>{v.label}</span>
            {v.status === "coming_soon" ? (
              <Pill variant="default" style={{ marginTop: 6 }}>
                Coming soon
              </Pill>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function BusinessStep({
  draft,
  vertical,
  onUpdate,
  onSubmit,
  loading,
}: {
  draft: Partial<DemoSession>;
  vertical: Vertical | null;
  onUpdate: (patch: Partial<DemoSession>) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <TextField
        label="Business name"
        placeholder="e.g. The Brow Studio"
        value={draft.businessName ?? ""}
        onChange={(e) => onUpdate({ businessName: e.currentTarget.value })}
        required
      />
      <div style={{ marginTop: 14 }}>
        <TextField
          label="City or area"
          placeholder="e.g. Brooklyn, NY"
          value={draft.city ?? ""}
          onChange={(e) => onUpdate({ city: e.currentTarget.value })}
        />
      </div>
      <div style={{ marginTop: 18 }}>
        <label className="ui-label">Top services you offer</label>
        <ToggleGroup
          options={vertical?.serviceOptions ?? []}
          values={draft.services ?? []}
          onChange={(values) => onUpdate({ services: values })}
        />
      </div>
      <div style={{ marginTop: 18 }}>
        <TextField
          label="Booking tool (optional)"
          placeholder="e.g. Square, Fresha, Calendly"
          value={draft.bookingTool ?? ""}
          onChange={(e) => onUpdate({ bookingTool: e.currentTarget.value })}
        />
      </div>
      <div style={{ marginTop: 22 }}>
        <Button type="submit" variant="primary" loading={loading}>
          Continue
        </Button>
      </div>
    </form>
  );
}

function IntakeStep({
  draft,
  vertical,
  onUpdate,
  setAnswer,
  onSubmit,
  loading,
}: {
  draft: Partial<DemoSession>;
  vertical: Vertical | null;
  onUpdate: (patch: Partial<DemoSession>) => void;
  setAnswer: (name: string, value: unknown) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      {vertical?.intakeFields.map((field, index) => (
        <div
          key={field.name}
          style={{ marginTop: index === 0 ? 0 : 16 }}
        >
          {field.type === "select" ? (
            <SelectField
              label={field.label}
              options={field.options?.map((o) => ({ label: o, value: o })) ?? []}
              value={String(draft.verticalAnswers?.[field.name] ?? "")}
              onChange={(e) => setAnswer(field.name, e.currentTarget.value)}
              required={field.required}
            />
          ) : field.type === "yes_no" ? (
            <div>
              <label className="ui-label">{field.label}</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Yes", "No"].map((option) => (
                  <ChoiceButton
                    key={option}
                    selected={String(draft.verticalAnswers?.[field.name]) === option}
                    onClick={() => setAnswer(field.name, option)}
                  >
                    {option}
                  </ChoiceButton>
                ))}
              </div>
            </div>
          ) : field.type === "multi_select" ? (
            <div>
              <label className="ui-label">{field.label}</label>
              <ToggleGroup
                options={field.options ?? []}
                values={
                  Array.isArray(draft.verticalAnswers?.[field.name])
                    ? (draft.verticalAnswers[field.name] as string[])
                    : []
                }
                onChange={(values) => setAnswer(field.name, values)}
              />
            </div>
          ) : field.type === "textarea" ? (
            <TextArea
              label={field.label}
              value={String(draft.verticalAnswers?.[field.name] ?? "")}
              onChange={(e) => setAnswer(field.name, e.currentTarget.value)}
              required={field.required}
            />
          ) : (
            <TextField
              label={field.label}
              value={String(draft.verticalAnswers?.[field.name] ?? "")}
              onChange={(e) => setAnswer(field.name, e.currentTarget.value)}
              required={field.required}
            />
          )}
        </div>
      ))}

      <div style={{ marginTop: 20 }}>
        <TextField
          label="Your name"
          placeholder="Jane Doe"
          value={draft.fullName ?? ""}
          onChange={(e) => onUpdate({ fullName: e.currentTarget.value })}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <TextField
          label="Email"
          type="email"
          placeholder="jane@studio.com"
          value={draft.email ?? ""}
          onChange={(e) => onUpdate({ email: e.currentTarget.value })}
        />
      </div>
      <div style={{ marginTop: 14 }}>
        <TextField
          label="Phone"
          type="tel"
          placeholder="(555) 123-4567"
          value={draft.phone ?? ""}
          onChange={(e) => onUpdate({ phone: e.currentTarget.value })}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <SelectField
          label="How would you like the demo?"
          options={[
            { label: "Talk in my browser", value: "browser" },
            { label: "Call me now (coming soon)", value: "phone" },
          ]}
          value={draft.demoMode ?? "browser"}
          onChange={(e) =>
            onUpdate({ demoMode: e.currentTarget.value as "browser" | "phone" })
          }
        />
      </div>

      <div style={{ marginTop: 22 }}>
        <Button type="submit" variant="primary" loading={loading}>
          Continue
        </Button>
      </div>
    </form>
  );
}

function VoiceStep({
  selectedVoice,
  onSelect,
  onStart,
  loading,
  turnEnabled,
}: {
  selectedVoice: string;
  onSelect: (voice: string) => void;
  onStart: () => void;
  loading: boolean;
  turnEnabled: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const preview = (value: string) => {
    const el = audioRef.current;
    if (!el) return;
    if (playing === value) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = `/voices/${value}.wav`;
    el.currentTime = 0;
    void el.play().catch(() => setPlaying(null));
    setPlaying(value);
  };

  return (
    <div>
      <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
        Pick how you want the agent to sound. Tap the play button to hear a
        sample.
      </p>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} hidden />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 8,
          maxHeight: 320,
          overflowY: "auto",
          paddingRight: 4,
        }}
      >
        {VOICES.map((voice) => {
          const selected = selectedVoice === voice.value;
          const isPlaying = playing === voice.value;
          return (
            <button
              key={voice.value}
              type="button"
              onClick={() => onSelect(voice.value)}
              className={`ui-button ${selected ? "ui-button--primary" : ""}`}
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                borderColor: selected ? "var(--accent)" : undefined,
              }}
            >
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  textAlign: "left",
                }}
              >
                <span style={{ fontWeight: 600 }}>{voice.name}</span>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {voice.desc}
                </span>
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  preview(voice.value);
                }}
                style={{
                  fontSize: 13,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: isPlaying ? "var(--accent)" : "transparent",
                }}
                role="button"
                aria-label={isPlaying ? "Pause preview" : "Play preview"}
              >
                {isPlaying ? "⏸" : "▶"}
              </span>
            </button>
          );
        })}
      </div>

      {!turnEnabled ? (
        <p
          style={{
            marginTop: 12,
            fontSize: 13,
            color: "var(--warn)",
          }}
        >
          Voice calls are not available right now. You can still pick a voice,
          but the live call step is disabled.
        </p>
      ) : null}
      <div style={{ marginTop: 22 }}>
        <Button
          onClick={onStart}
          variant="primary"
          loading={loading}
          disabled={!selectedVoice || !turnEnabled}
        >
          Start demo call
        </Button>
      </div>
    </div>
  );
}

function FeedbackStep({
  onSubmit,
  loading,
}: {
  onSubmit: (payload: {
    score: number;
    chips: string[];
    text: string;
    outcome: "positive" | "neutral" | "negative" | "abandoned";
  }) => void;
  loading: boolean;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (score === null) return;
    const outcome: "positive" | "neutral" | "negative" | "abandoned" =
      score >= 4 ? "positive" : score === 3 ? "neutral" : "negative";
    onSubmit({ score, chips, text, outcome });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ color: "var(--ink-3)", marginBottom: 12 }}>
        Rate the call so we can keep tuning the agent.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label className="ui-label">How did the call sound? *</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <ChoiceButton
              key={n}
              selected={score === n}
              onClick={() => setScore(n)}
            >
              {n}
            </ChoiceButton>
          ))}
        </div>
        {score === null ? (
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
            1 = poor, 5 = excellent
          </p>
        ) : (
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
            {score === 1
              ? "Poor"
              : score === 2
                ? "Not great"
                : score === 3
                  ? "Okay"
                  : score === 4
                    ? "Good"
                    : "Excellent"}
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="ui-label">What stood out?</label>
        <ToggleGroup options={FEEDBACK_CHIPS} values={chips} onChange={setChips} />
      </div>

      <TextArea
        label="Anything else we should know?"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        rows={3}
      />

      <div style={{ marginTop: 22 }}>
        <Button
          type="submit"
          variant="primary"
          loading={loading}
          disabled={score === null}
        >
          Finish
        </Button>
      </div>
    </form>
  );
}

function ThanksStep({ onNew }: { onNew: () => void }) {
  return (
    <div>
      <p style={{ color: "var(--ink-3)", marginBottom: 18 }}>
        Thanks for trying the Vocalonix demo. We&apos;ll keep improving the
        experience for your industry.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Button variant="primary" onClick={onNew}>
          Start a new demo
        </Button>
        <Link to="/" className="ui-button">
          Back to home
        </Link>
      </div>
    </div>
  );
}

export function DemoPage() {
  const [step, setStep] = useState<Step>("vertical");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<DemoSession>>(emptyDraft());
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [vertical, setVertical] = useState<Vertical | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<DemoStartResponse | null>(null);
  const health = useDograhHealth();

  const updateDraft = (patch: Partial<DemoSession>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const setAnswer = (name: string, value: unknown) => {
    setDraft((prev) => ({
      ...prev,
      verticalAnswers: { ...(prev.verticalAnswers ?? {}), [name]: value },
    }));
  };

  useEffect(() => {
    setLoading(true);
    api
      .verticals()
      .then((v) => {
        setVerticals(v);
        const stored = loadFromStorage();
        if (stored && !isExpired(stored.savedAt)) {
          setStep(stored.step);
          setSessionId(stored.sessionId);
          setDraft(stored.draft);
          setCall(stored.call ?? null);
          const matched = v.find((x) => x.slug === stored.draft.vertical);
          if (matched) setVertical(matched);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    saveToStorage({
      savedAt: new Date().toISOString(),
      step,
      sessionId,
      draft,
      call,
    });
  }, [step, sessionId, draft, call]);

  const selectVertical = async (v: Vertical) => {
    setError(null);
    setLoading(true);
    try {
      const { id } = await api.demo.createSession(v.slug);
      setSessionId(id);
      setVertical(v);
      setDraft((prev) => ({
        ...prev,
        vertical: v.slug,
        services: v.defaultServices,
        voice: prev?.voice ?? "zephyr",
      }));
      setStep("business");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start the demo.");
    } finally {
      setLoading(false);
    }
  };

  const submitBusiness = async () => {
    if (!sessionId || !draft.businessName?.trim()) {
      setError("Enter your business name to continue.");
      return;
    }
    setLoading(true);
    try {
      await api.demo.updateSession(sessionId, {
        businessName: draft.businessName.trim(),
        city: draft.city ?? null,
        services: draft.services,
        bookingTool: draft.bookingTool,
      });
      setStep("intake");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save details.");
    } finally {
      setLoading(false);
    }
  };

  const submitIntake = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      await api.demo.updateSession(sessionId, {
        verticalAnswers: draft.verticalAnswers,
        fullName: draft.fullName,
        email: draft.email,
        phone: draft.phone,
        demoMode: draft.demoMode,
      });
      setStep("voice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save details.");
    } finally {
      setLoading(false);
    }
  };

  const startCall = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      await api.demo.updateSession(sessionId, { voice: draft.voice });
      const started = await api.demo.start(sessionId);
      setCall(started);
      setStep("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start the call.");
    } finally {
      setLoading(false);
    }
  };

  const endCall = async (durationSeconds: number) => {
    if (!sessionId) return;
    await api.demo.end(sessionId, { durationSeconds });
    setStep("feedback");
  };

  const submitFeedback = async ({
    score,
    chips,
    text,
    outcome,
  }: {
    score: number;
    chips: string[];
    text: string;
    outcome: "positive" | "neutral" | "negative" | "abandoned";
  }) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      await api.demo.feedback(sessionId, {
        feedbackScore: score,
        feedbackChips: chips,
        feedbackText: text,
        outcome,
      });
      if (outcome === "positive") {
        const signupParams = new URLSearchParams();
        if (draft.email) signupParams.set("demoEmail", draft.email);
        if (draft.fullName) signupParams.set("demoName", draft.fullName);

        const redirectParams = new URLSearchParams();
        if (draft.businessName) redirectParams.set("demoBusiness", draft.businessName);
        if (draft.city) redirectParams.set("demoCity", draft.city);
        if (draft.vertical) redirectParams.set("demoVertical", draft.vertical);
        const redirectSearch = redirectParams.toString();
        const redirect = `/app/onboarding/create${redirectSearch ? `?${redirectSearch}` : ""}`;
        signupParams.set("redirect", redirect);

        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
        window.location.href = `/signup?${signupParams.toString()}`;
        return;
      }
      setStep("thanks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit feedback.");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (step === "thanks") {
      setStep("vertical");
      setSessionId(null);
      setDraft(emptyDraft());
      setCall(null);
      setVertical(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      return;
    }
    const prev: Record<Step, Step | null> = {
      vertical: null,
      business: "vertical",
      intake: "business",
      voice: "intake",
      live: "voice",
      feedback: "live",
      thanks: "feedback",
    };
    const next = prev[step];
    if (next) setStep(next);
  };

  if (loading && verticals.length === 0) {
    return (
      <AuthShell>
        <Box style={{ padding: 32, textAlign: "center" }}>
          <p>Loading demo…</p>
        </Box>
      </AuthShell>
    );
  }

  return (
    <AuthShell width={step === "live" ? 720 : 560}>
      <Box style={{ padding: 28 }}>
        <DemoHeader
          step={step}
          title={formatTitle(step)}
          onBack={step === "vertical" ? undefined : goBack}
          backLabel={step === "thanks" ? "Start over" : undefined}
        />
        {!health.isLoading && !health.turnEnabled ? (
          <div style={{ marginBottom: 16 }}>
            <Alert variant="warn">
              Voice calls are not enabled on this environment yet, so you can
              build a demo but not start a live call.
            </Alert>
          </div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: 16 }}>
            <Alert variant="warn">{error}</Alert>
          </div>
        ) : null}

        {step === "vertical" && (
          <VerticalStep
            verticals={verticals}
            loading={loading}
            onSelect={selectVertical}
          />
        )}
        {step === "business" && (
          <BusinessStep
            draft={draft}
            vertical={vertical}
            onUpdate={updateDraft}
            onSubmit={submitBusiness}
            loading={loading}
          />
        )}
        {step === "intake" && (
          <IntakeStep
            draft={draft}
            vertical={vertical}
            onUpdate={updateDraft}
            setAnswer={setAnswer}
            onSubmit={submitIntake}
            loading={loading}
          />
        )}
        {step === "voice" && (
          <VoiceStep
            selectedVoice={draft.voice ?? "zephyr"}
            onSelect={(voice) => updateDraft({ voice })}
            onStart={startCall}
            loading={loading}
            turnEnabled={health.turnEnabled}
          />
        )}
        {step === "live" && call && (
          <LiveCall call={call} onEnd={endCall} />
        )}
        {step === "feedback" && (
          <FeedbackStep onSubmit={submitFeedback} loading={loading} />
        )}
        {step === "thanks" && <ThanksStep onNew={goBack} />}
      </Box>
    </AuthShell>
  );
}
