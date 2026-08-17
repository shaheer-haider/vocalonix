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
  EmptyState,
  Pill,
  TextArea,
  TextField,
  VoiceOrb,
  type VoiceOrbState,
} from "../components/ui";
import { AuthShell } from "../components/shell";
import { useDograhHealth } from "../hooks/useDograhHealth";
import type {
  DemoSession,
  DemoStartResponse,
  Vertical,
  VoiceWidget,
  VoiceWidgetStatus,
} from "../types";

/**
 * Three steps, and only one of them is a form.
 *
 * The funnel used to ask for a business name, a city, services, a booking tool,
 * trade-specific answers, a name, an email and a voice — nine fields across
 * four screens — before a visitor heard a single word. Everything it collected
 * was either invented by the visitor on the spot or available from the trade
 * itself, so none of it made the demo better; it just stood between somebody
 * curious and the thing that convinces them. Contact details are now asked for
 * after the call, when there is a reason to give them.
 */
type Step = "vertical" | "live" | "wrap";

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
const TOTAL_STEPS = 3;

/**
 * The orb has one "live" state; the widget distinguishes listening from
 * speaking, which matters inside the panel but not on the demo's single orb.
 */
function toOrbState(status: VoiceWidgetStatus): VoiceOrbState {
  if (status === "listening" || status === "speaking") return "connected";
  if (status === "connecting" || status === "failed") return status;
  return "idle";
}

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
    voice: "aria",
  };
}

function formatTitle(step: Step) {
  switch (step) {
    case "vertical":
      return "Pick your industry";
    case "live":
      return "Live demo call";
    case "wrap":
      return "Put this on your site";
  }
}

function formatStepNumber(step: Step) {
  const map: Record<Step, number> = { vertical: 1, live: 2, wrap: 3 };
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
        <span className="demo-progress">
          Step {formatStepNumber(step)} of {TOTAL_STEPS}
        </span>
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
  const [status, setStatus] = useState<VoiceOrbState>("idle");
  const [widgetReady, setWidgetReady] = useState(false);
  const [seconds, setSeconds] = useState(CALL_DURATION_SECONDS);
  const [callError, setCallError] = useState<string | null>(null);
  // A ref, not state: the countdown's endCall would otherwise close over the
  // value from before setStartedAt flushed, and every timed-out call logged 0s.
  const startedAtRef = useRef<number | null>(null);
  const loadedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      window.VocalonixWidget?.end();
    };
  }, []);

  const bindCallbacks = useCallback((widget: VoiceWidget) => {
    widget.onStatusChange(({ status: next, detail }) => {
      setStatus(toOrbState(next));
      if (next === "failed") setCallError(detail || "The call failed.");
      else setCallError(null);
    });
    widget.onError((err) => {
      setCallError(
        err instanceof Error ? err.message : String(err ?? "Call failed"),
      );
    });
    setStatus(toOrbState(widget.getState().status));
    setWidgetReady(true);
  }, []);

  const unloadWidget = () => {
    document.getElementById("vocalonix-widget-script")?.remove();
    delete (window as { VocalonixWidget?: VoiceWidget }).VocalonixWidget;
  };

  useEffect(() => {
    if (window.VocalonixWidget && loadedTokenRef.current === call.token) {
      bindCallbacks(window.VocalonixWidget);
      return;
    }
    if (window.VocalonixWidget) unloadWidget();

    const script = document.createElement("script");
    script.id = "vocalonix-widget-script";
    script.src = call.scriptUrl;
    script.async = true;
    script.onload = () => {
      loadedTokenRef.current = call.token;
      if (window.VocalonixWidget) bindCallbacks(window.VocalonixWidget);
    };
    script.onerror = () => setCallError("Could not load the call widget.");
    document.body.appendChild(script);
  }, [call, bindCallbacks]);

  useEffect(() => {
    if (status !== "connected") return;
    startedAtRef.current = Date.now();
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
    window.VocalonixWidget?.end();
    const duration = startedAtRef.current
      ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
      : 0;
    onEnd(duration);
  };

  const start = () => {
    if (!window.VocalonixWidget) return;
    setCallError(null);
    window.VocalonixWidget.start();
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
      {/* The agent answers as an invented business. Saying which one up front
          stops the caller wondering whose receptionist just picked up. */}
      <p style={{ color: "var(--ink-3)", marginBottom: 14 }}>
        You&apos;re calling <strong>{call.businessName}</strong>, where{" "}
        {call.agentName} is on reception.
      </p>
      <div className="demo-call">
        <VoiceOrb state={status} label={statusCopy[status] ?? status} />
        <p className="demo-call__status" role="status">
          {statusCopy[status] ?? status}
        </p>
        <p className="demo-call__timer">{formatTime(seconds)}</p>
        <Button
          variant={inCall ? "destructive" : "primary"}
          onClick={inCall ? endCall : start}
          disabled={!widgetReady || Boolean(callError)}
        >
          {inCall ? "End call" : "Start call"}
        </Button>
      </div>

      <Box padding="sm" style={{ marginBottom: 16 }}>
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
        <Box tone="tinted" padding="sm" style={{ marginBottom: 16 }}>
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
  // An empty list means the industry list didn't load. Saying so beats an
  // empty page, which is what a visitor got before the guard was added.
  if (!loading && verticals.length === 0) {
    return (
      <EmptyState title="We couldn't load the industry list">
        The demo needs it to build your agent. Refresh to try again, or start
        setting up directly — you can hear your agent from inside the app.
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Try again
          </Button>
          <Link to="/signup" className="ui-button">
            Start setup
          </Link>
        </div>
      </EmptyState>
    );
  }

  return (
    <div>
      <p style={{ color: "var(--ink-3)", marginBottom: 18 }}>
        Pick the industry closest to your business and the call starts straight
        away — no forms, no email, one minute.
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

function WrapStep({
  draft,
  onUpdate,
  onCreateAccount,
  onSubmitFeedback,
  loading,
}: {
  draft: Partial<DemoSession>;
  onUpdate: (patch: Partial<DemoSession>) => void;
  onCreateAccount: () => void;
  onSubmitFeedback: (payload: {
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
  const [sent, setSent] = useState(false);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    onCreateAccount();
  };

  const handleFeedback = () => {
    if (score === null) return;
    const outcome: "positive" | "neutral" | "negative" | "abandoned" =
      score >= 4 ? "positive" : score === 3 ? "neutral" : "negative";
    onSubmitFeedback({ score, chips, text, outcome });
    setSent(true);
  };

  return (
    <div>
      <p style={{ color: "var(--ink-3)", marginBottom: 18 }}>
        That was a stock agent for your trade. Yours would answer with your real
        prices, your real hours and your own knowledge — on your website, every
        time you miss a call.
      </p>

      <form onSubmit={handleCreate}>
        <TextField
          label="Your name"
          placeholder="Jane Doe"
          value={draft.fullName ?? ""}
          onChange={(e) => onUpdate({ fullName: e.currentTarget.value })}
        />
        <TextField
          label="Email"
          type="email"
          required
          placeholder="jane@studio.com"
          helper="We use this to set up your account. No card needed."
          value={draft.email ?? ""}
          onChange={(e) => onUpdate({ email: e.currentTarget.value })}
        />
        <div style={{ marginTop: 20 }}>
          <Button type="submit" variant="primary" loading={loading}>
            Create my agent
          </Button>
        </div>
      </form>

      <hr className="wrap-divider" />

      <details className="wrap-feedback">
        <summary>Tell us how the call went (optional)</summary>
        {sent ? (
          <Alert variant="success">Thanks — that helps us tune the agent.</Alert>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label className="ui-label">How did the call sound?</label>
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
              <p className="wrap-feedback__hint">1 = poor, 5 = excellent</p>
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

            <div style={{ marginTop: 16 }}>
              <Button onClick={handleFeedback} disabled={score === null}>
                Send feedback
              </Button>
            </div>
          </>
        )}
      </details>
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

  /**
   * One click, straight to the call.
   *
   * The agent for a trade is already built and published on the engine, so
   * there is nothing to wait for between choosing a trade and hearing it.
   */
  const selectVertical = async (v: Vertical) => {
    setError(null);
    setLoading(true);
    try {
      const { id } = await api.demo.createSession(v.slug);
      setSessionId(id);
      setVertical(v);
      setDraft((prev) => ({ ...prev, vertical: v.slug, services: v.defaultServices }));
      const started = await api.demo.start(id);
      setCall(started);
      setStep("live");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start the demo.");
    } finally {
      setLoading(false);
    }
  };

  const endCall = async (durationSeconds: number) => {
    if (!sessionId) return;
    await api.demo.end(sessionId, { durationSeconds });
    setStep("wrap");
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
    try {
      await api.demo.feedback(sessionId, {
        feedbackScore: score,
        feedbackChips: chips,
        feedbackText: text,
        outcome,
      });
    } catch {
      // Feedback is optional and secondary; never block the visitor on it.
    }
  };

  /**
   * Offered to everyone who reaches the end of the call. The rating used to gate
   * this silently, so a visitor who rated the call 3 was never shown a way to sign up.
   */
  const createAccount = async () => {
    setLoading(true);
    try {
      if (sessionId) {
        await api.demo.updateSession(sessionId, {
          fullName: draft.fullName,
          email: draft.email,
        });
      }
    } catch {
      // Prefill is a convenience; a failure here must not block signup.
    }

    const signupParams = new URLSearchParams();
    if (draft.email) signupParams.set("demoEmail", draft.email);
    if (draft.fullName) signupParams.set("demoName", draft.fullName);

    // Only the trade carries over now. The demo no longer asks for a business
    // name or a city, and inventing one to prefill would be worse than an
    // empty field the visitor fills in with the truth.
    const redirectParams = new URLSearchParams();
    if (draft.vertical) redirectParams.set("demoVertical", draft.vertical);
    const redirectSearch = redirectParams.toString();
    signupParams.set(
      "redirect",
      `/app/onboarding/create${redirectSearch ? `?${redirectSearch}` : ""}`,
    );

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    window.location.href = `/signup?${signupParams.toString()}`;
  };

  const goBack = () => {
    // Only back out of the live call — going "back" from the wrap step would
    // mean re-running a call the visitor has already had.
    if (step === "live") setStep("vertical");
  };

  if (loading && verticals.length === 0) {
    return (
      <AuthShell>
        <Box padding="xl" style={{ textAlign: "center" }}>
          <p>Loading demo…</p>
        </Box>
      </AuthShell>
    );
  }

  return (
    <AuthShell width={step === "live" ? 720 : 560}>
      <Box padding="xl">
        <DemoHeader
          step={step}
          title={formatTitle(step)}
          onBack={step === "vertical" ? undefined : goBack}
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
        {step === "live" && call && (
          <LiveCall call={call} onEnd={endCall} />
        )}
        {step === "wrap" && (
          <WrapStep
            draft={draft}
            onUpdate={updateDraft}
            onCreateAccount={createAccount}
            onSubmitFeedback={submitFeedback}
            loading={loading}
          />
        )}
      </Box>
    </AuthShell>
  );
}
