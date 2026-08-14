import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";

import { Alert, Box, Button, EmptyState, Pill, TextField } from "../components/ui";
import { WorkspaceShell } from "./business";
import "./notifications.css";

const EVENTS = [
  { k: "esc", label: "Escalation raised mid-call", sub: "The agent hands a live caller to a person", urgent: true },
  { k: "ooh", label: "Call outside opening hours", sub: "Answered overnight or on a closed day", urgent: true },
  { k: "noshow", label: "No-show marked", sub: "Someone did not turn up for a booked slot", urgent: false },
  { k: "held", label: "Held slot about to expire", sub: "A provisional booking 30 minutes from lapsing", urgent: false },
  { k: "booked", label: "New booking taken by the agent", sub: "Straight into the diary, nobody involved", urgent: false },
  { k: "callback", label: "Callback past its promise", sub: "Told the caller a time and it has gone by", urgent: false },
  { k: "weekly", label: "Weekly summary", sub: "Monday, 08:00 — calls, bookings, gaps", urgent: false },
];

const CHANNELS = ["Email", "SMS", "Push"];

const SAMPLE = [
  { t: "07:42", v: "Missed call from 07700 900318 while shut", ev: "ooh" },
  { t: "11:15", v: "Escalation — caller wanted a refund, Dee picked up", ev: "esc" },
  { t: "14:03", v: "Agent booked a hygiene slot for Thu 09:30", ev: "booked" },
  { t: "16:40", v: "Held slot for Marcus Bell lapsed unclaimed", ev: "held" },
  { t: "18:20", v: "Callback for Nadia Rahman went past its promise", ev: "callback" },
];

const PACE = ["Straight away", "Every 15 min", "Hourly"];

const OTHERS = [
  { name: "Dee Okoro", via: "PUSH + SMS" },
  { name: "Priya Shah", via: "EMAIL ONLY" },
  { name: "Tom Lynch", via: "NOTHING SET" },
  { name: "Dr. Elena Reyes", via: "SMS, NIGHTS" },
];

type Prefs = Record<string, Record<string, boolean>>;

type ChainMember = { id: string; name: string; how: string };

function CheckToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} className="notifications-toggle" onClick={onToggle}>
      <span className={`notifications-toggle__box ${on ? "notifications-toggle__box--on" : ""}`.trim()}>
        {on ? "✓" : ""}
      </span>
      <span className="notifications-toggle__label">{label}</span>
    </button>
  );
}

export function WorkspaceNotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>({
    esc: { Email: true, SMS: true, Push: true },
    ooh: { Email: true, SMS: true, Push: false },
    noshow: { Email: true, SMS: false, Push: true },
    held: { Email: false, SMS: false, Push: true },
    booked: { Email: false, SMS: false, Push: true },
    callback: { Email: true, SMS: false, Push: true },
    weekly: { Email: true, SMS: false, Push: false },
  });
  const [quiet, setQuiet] = useState(true);
  const [qFrom, setQFrom] = useState("20:00");
  const [qTo, setQTo] = useState("07:30");
  const [override, setOverride] = useState(true);
  const [pace, setPace] = useState("Straight away");
  const [smsOk, setSmsOk] = useState(true);
  const [email, setEmail] = useState("owner@acmedental.com");
  const [mobile, setMobile] = useState("+44 7700 900912");
  const [chain, setChain] = useState<ChainMember[]>([
    { id: "own", name: "Owner One", how: "call, then text" },
    { id: "dee", name: "Dee Okoro", how: "front desk phone" },
    { id: "pri", name: "Priya Shah", how: "call, then text" },
  ]);
  const [afterHoursOn, setAfterHoursOn] = useState(true);
  const [onCall, setOnCall] = useState<ChainMember[]>([
    { id: "own", name: "Owner One", how: "call, then text" },
    { id: "rey", name: "Dr. Elena Reyes", how: "on-call mobile" },
  ]);

  const toggleCell = (ev: string, ch: string) => {
    if (ch === "SMS" && !smsOk && !prefs[ev].SMS) return;
    setPrefs((p) => ({ ...p, [ev]: { ...p[ev], [ch]: !p[ev][ch] } }));
  };

  const moveChain = (id: string, dir: "up" | "down") => {
    setChain((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const toggleOnCall = (id: string) => {
    setOnCall((prev) => prev.filter((m) => m.id !== id));
  };

  const { sample, reached } = useMemo(() => {
    const rows = SAMPLE.map((s) => {
      const p = prefs[s.ev] || {};
      const via = CHANNELS.filter((c) => p[c]);
      const urgent = EVENTS.find((e) => e.k === s.ev)?.urgent ?? false;
      const held = quiet && !(urgent && override) && (s.t < qTo || s.t > qFrom);
      const viaText = via.length ? (held ? `${via.join(" + ")} · held to ${qTo}` : via.join(" + ")) : "nothing — all three switched off";
      const active = via.length > 0;
      const tone = active ? (held ? "warn" : "good") : "muted";
      return { ...s, viaText, active, tone };
    });
    const reached = rows.filter((r) => !r.viaText.includes("nothing")).length;
    return { sample: rows, reached };
  }, [prefs, quiet, qFrom, qTo, override]);

  const paceNote =
    pace === "Straight away"
      ? "One message per event. Busy days get noisy."
      : pace === "Every 15 min"
        ? "Bundled into one message every quarter of an hour."
        : "One digest an hour — quietest, and slowest to notice a no-show.";

  const quietNote = override
    ? `Escalations and after-hours calls still ring. Everything else waits for ${qTo}.`
    : `Nothing at all between ${qFrom} and ${qTo} — including escalations. Callers hear the after-hours message instead.`;

  return (
    <WorkspaceShell>
      {(business) => (
        <>
          <Alert variant="warn">Design preview — notification settings are sample data.</Alert>

          <div className="notifications-header">
            <div>
              <p className="eyebrow">Yours only. Everyone sets their own.</p>
              <h1>Notifications</h1>
            </div>
            <Button variant="default" onClick={() => {}}>
              Send me a test alert
            </Button>
          </div>

          <div className="notifications-layout">
            <div className="notifications-primary">
              <Box className="notifications-card">
                <div className="notifications-card__head">
                  <h2 className="notifications-card__title">What reaches you, and how</h2>
                  <span className="notifications-card__note">Your own switches — nobody else sees them</span>
                </div>

                <div className="notifications-matrix__header">
                  <span className="notifications-matrix__head-cell">Event</span>
                  {CHANNELS.map((c) => (
                    <span key={c} className="notifications-matrix__head-channel">{c}</span>
                  ))}
                </div>

                <div className="notifications-matrix">
                  {EVENTS.map((e) => {
                    const anyOn = CHANNELS.some((c) => prefs[e.k][c]);
                    return (
                      <div key={e.k} className={`notifications-matrix__row ${anyOn ? "notifications-matrix__row--any" : ""}`.trim()}>
                        <div className="notifications-matrix__event">
                          <div className="notifications-matrix__label">
                            {e.label}
                            {e.urgent ? <Pill variant="accent">Urgent</Pill> : null}
                          </div>
                          <div className="notifications-matrix__sub">{e.sub}</div>
                        </div>
                        {CHANNELS.map((c) => (
                          <Button
                            key={c}
                            variant={prefs[e.k][c] ? "primary" : "default"}
                            aria-pressed={prefs[e.k][c]}
                            onClick={() => toggleCell(e.k, c)}
                            className={`notifications-matrix__cell ${prefs[e.k][c] ? "notifications-matrix__cell--on" : ""}`.trim()}
                          >
                            {prefs[e.k][c] ? "✓" : ""}
                          </Button>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <p className="notifications-matrix__footer">
                  No-shows and held slots come out of <Link to="/app/$businessSlug/bookings" params={{ businessSlug: business.slug }}>Bookings</Link>. Escalations follow the rules in{" "}
                  <Link to="/app/$businessSlug/settings/agent" params={{ businessSlug: business.slug }}>Configuration → Agent</Link> and the chain on <Link to="/app/$businessSlug/team" params={{ businessSlug: business.slug }}>Team</Link>.
                </p>
              </Box>

              <div className="notifications-two-col">
                <Box className="notifications-card">
                  <h2 className="notifications-card__title">Quiet hours</h2>

                  <CheckToggle on={quiet} onToggle={() => setQuiet(!quiet)} label="Hold everything back overnight" />

                  {quiet && (
                    <div className="notifications-quiet">
                      <div className="notifications-quiet__range">
                        <input
                          type="text"
                          className="ui-input notifications-quiet__time"
                          value={qFrom}
                          onChange={(e) => setQFrom(e.target.value)}
                          style={{ width: 78, textAlign: "center" }}
                        />
                        <span className="notifications-quiet__arrow">→</span>
                        <input
                          type="text"
                          className="ui-input notifications-quiet__time"
                          value={qTo}
                          onChange={(e) => setQTo(e.target.value)}
                          style={{ width: 78, textAlign: "center" }}
                        />
                        <span className="notifications-quiet__span">about 11 hours</span>
                      </div>

                      <CheckToggle
                        on={override}
                        onToggle={() => setOverride(!override)}
                        label="Let urgent ones through anyway — escalations and after-hours calls"
                      />

                      <p className={`notifications-quiet__note ${override ? "" : "notifications-quiet__note--stop"}`.trim()}>
                        {quietNote}
                      </p>
                    </div>
                  )}

                  <div className="notifications-pace">
                    <div className="notifications-pace__title">Everything else arrives</div>
                    <div className="notifications-pace__segs">
                      {PACE.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPace(v)}
                          className={`notifications-pace__seg ${pace === v ? "notifications-pace__seg--active" : ""}`.trim()}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="notifications-pace__note">{paceNote}</p>
                  </div>
                </Box>

                <Box className="notifications-card">
                  <h2 className="notifications-card__title">Where they land</h2>

                  <div className="notifications-dest">
                    <div className="notifications-dest__row">
                      <div className="notifications-dest__body">
                        <TextField
                          label="Email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          helper="Verified · your sign-in address"
                        />
                      </div>
                      <Button
                        variant="default"
                        className="notifications-dest__btn"
                        onClick={() => {}}
                      >
                        Change
                      </Button>
                    </div>

                    <div className={`notifications-dest__row ${smsOk ? "" : "notifications-dest__row--bad"}`.trim()}>
                      <div className="notifications-dest__body">
                        <TextField
                          label="Mobile"
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          helper={smsOk ? "Verified · texts arrive from 0461" : "Not verified — no texts can be sent"}
                          mono
                        />
                      </div>
                      <Button
                        variant={smsOk ? "default" : "primary"}
                        className="notifications-dest__btn"
                        onClick={() => setSmsOk(!smsOk)}
                      >
                        {smsOk ? "Change" : "Verify"}
                      </Button>
                    </div>

                    <div className="notifications-dest__row">
                      <div className="notifications-dest__body">
                        <TextField
                          label="Push"
                          value="iPhone · Vocalonix app"
                          readOnly
                          helper="Last seen 12 minutes ago"
                        />
                      </div>
                      <Button variant="default" className="notifications-dest__btn" onClick={() => {}}>
                        Devices
                      </Button>
                    </div>
                  </div>

                  <div className="notifications-rule">
                    <strong className="notifications-rule__title">One rule worth knowing</strong>
                    <p className="notifications-rule__copy">
                      A text only goes out if you are in the escalation chain on <Link to="/app/$businessSlug/team" params={{ businessSlug: business.slug }}>Team</Link>. Turning SMS on here does not put you on the rota.
                    </p>
                  </div>
                </Box>
              </div>
            </div>

            <Box className="notifications-rail">
              <div className="notifications-rail__section">
                <div className="notifications-rail__head">
                  <span className="nav-section">Escalation chain</span>
                  <span className="notifications-rail__hint">in order</span>
                </div>

                {chain.length === 0 ? (
                  <EmptyState title="Nobody takes escalations">
                    The agent will apologise and take a message instead.
                  </EmptyState>
                ) : (
                  <div className="notifications-chain">
                    {chain.map((m, i) => (
                      <div key={m.id} className="notifications-chain__row">
                        <span className="notifications-chain__n">{i + 1}</span>
                        <div className="notifications-chain__body">
                          <div className="notifications-chain__name">{m.name}</div>
                          <div className="notifications-chain__how">{m.how}</div>
                        </div>
                        <div className="notifications-chain__arrows">
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => moveChain(m.id, "up")}
                            className={`notifications-chain__arrow ${i === 0 ? "notifications-chain__arrow--dim" : ""}`.trim()}
                          >
                            ▴
                          </button>
                          <button
                            type="button"
                            disabled={i === chain.length - 1}
                            onClick={() => moveChain(m.id, "down")}
                            className={`notifications-chain__arrow ${i === chain.length - 1 ? "notifications-chain__arrow--dim" : ""}`.trim()}
                          >
                            ▾
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="notifications-rail__note">
                  Tried top to bottom, 25 seconds each. What counts as an escalation is set in{" "}
                  <Link to="/app/$businessSlug/settings/agent" params={{ businessSlug: business.slug }}>Configuration → Agent</Link>.
                </p>
              </div>

              <div className="notifications-rail__section">
                <div className="notifications-rail__head">
                  <span className="nav-section">After hours · 18:00 to 08:00</span>
                  <CheckToggle on={afterHoursOn} onToggle={() => setAfterHoursOn(!afterHoursOn)} label="On at night" />
                </div>

                {afterHoursOn && onCall.length > 0 ? (
                  <div className="notifications-ooh">
                    {onCall.map((m) => (
                      <div key={m.id} className="notifications-ooh__row">
                        <span className="notifications-ooh__dot" />
                        <span className="notifications-ooh__name">{m.name}</span>
                        <button
                          type="button"
                          className="notifications-ooh__remove"
                          onClick={() => toggleOnCall(m.id)}
                        >
                          Off
                        </button>
                        <span className="notifications-ooh__how">{m.how}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Nobody on nights">
                    Overnight calls wait in <Link to="/app/$businessSlug/callbacks" params={{ businessSlug: business.slug }}>Callbacks</Link> until morning.
                  </EmptyState>
                )}

                <p className="notifications-rail__note">
                  Only calls the agent judges urgent go out at night. The rest wait for the 08:00 digest.
                </p>
              </div>

              <div className="notifications-rail__section">
                <div className="notifications-rail__head">
                  <span className="nav-section">Yesterday, you'd have had</span>
                  <span className="notifications-rail__hint">{reached} of {SAMPLE.length} reached you</span>
                </div>

                <div className="notifications-sample">
                  {sample.map((s) => (
                    <div key={s.t} className={`notifications-sample__row ${s.active ? "notifications-sample__row--active" : ""}`.trim()}>
                      <span className="notifications-sample__time">{s.t}</span>
                      <div className="notifications-sample__body">
                        <span className="notifications-sample__what">{s.v}</span>
                        <span className={`notifications-sample__via notifications-sample__via--${s.tone}`}>{s.viaText}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="notifications-rail__note">
                  Built from real events on 29 Jul, run through the switches as they stand now.
                </p>
              </div>

              <div className="notifications-rail__section notifications-rail__section--last">
                <div className="notifications-rail__head">
                  <span className="nav-section">Everyone else's settings</span>
                </div>

                <div className="notifications-others">
                  {OTHERS.map((o) => (
                    <div key={o.name} className="notifications-others__row">
                      <span className="notifications-others__name">{o.name}</span>
                      <span className="notifications-others__via">{o.via}</span>
                    </div>
                  ))}
                </div>

                <p className="notifications-rail__note">
                  You can see theirs, not change it. Nudge them, or move who is in the chain on{" "}
                  <Link to="/app/$businessSlug/team" params={{ businessSlug: business.slug }}>Team</Link>.
                </p>
              </div>
            </Box>
          </div>
        </>
      )}
    </WorkspaceShell>
  );
}
