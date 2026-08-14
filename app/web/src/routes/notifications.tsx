import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";

import { Box, Button, Pill, TextField } from "../components/ui";
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

const FEED = [
  { t: "18:20", v: "Callback for Nadia Rahman went past its promise", ev: "callback" },
  { t: "16:40", v: "Held slot for Marcus Bell lapsed unclaimed", ev: "held" },
  { t: "14:03", v: "Agent booked a hygiene slot for Thu 09:30", ev: "booked" },
  { t: "11:15", v: "Escalation — caller wanted a refund, Dee picked up", ev: "esc" },
  { t: "07:42", v: "Missed call from 07700 900318 while shut", ev: "ooh" },
];

const PACE = ["Straight away", "Every 15 min", "Hourly"];

type Prefs = Record<string, Record<string, boolean>>;

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
  const [view, setView] = useState<"inbox" | "settings">("inbox");
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

  const toggleCell = (ev: string, ch: string) => {
    if (ch === "SMS" && !smsOk && !prefs[ev].SMS) return;
    setPrefs((p) => ({ ...p, [ev]: { ...p[ev], [ch]: !p[ev][ch] } }));
  };

  const feed = useMemo(
    () =>
      FEED.map((item) => {
        const event = EVENTS.find((e) => e.k === item.ev);
        return {
          ...item,
          label: event?.label ?? "Notification",
          urgent: event?.urgent ?? false,
        };
      }),
    [],
  );

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
          <div className="notifications-header">
            <div>
              <p className="eyebrow">Yours only. Everyone sets their own.</p>
              <h1>Notifications</h1>
            </div>
            <div className="stack-row">
              <Button
                variant={view === "inbox" ? "primary" : "default"}
                onClick={() => setView("inbox")}
              >
                Notifications
              </Button>
              <Button
                variant={view === "settings" ? "primary" : "default"}
                onClick={() => setView("settings")}
              >
                Settings
              </Button>
            </div>
          </div>

          {view === "inbox" ? (
            <Box className="notifications-card" style={{ padding: "20px 22px", borderColor: "var(--line)", borderRadius: 14 }}>
              <div className="notifications-card__head">
                <h2 className="notifications-card__title">Latest</h2>
                <span className="notifications-card__note">Newest first</span>
              </div>
              <div className="notifications-sample">
                {feed.map((item) => (
                  <div key={item.t} className="notifications-sample__row notifications-sample__row--active">
                    <span className="notifications-sample__time">{item.t}</span>
                    <div className="notifications-sample__body">
                      <span className="notifications-sample__what">
                        {item.v}
                        {item.urgent ? <Pill variant="accent">Urgent</Pill> : null}
                      </span>
                      <span className="notifications-sample__via notifications-sample__via--muted">{item.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="notifications-rail__note">
                Delivery follows your rules in Settings — each alert goes to the
                channels you have switched on, where your device allows it.
              </p>
            </Box>
          ) : (
            <div className="notifications-primary">
              <Box className="notifications-card" style={{ padding: "20px 22px", borderColor: "var(--line)", borderRadius: 14 }}>
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
                  <Link to="/app/$businessSlug/settings/agent" params={{ businessSlug: business.slug }}>Configuration → Agent</Link>.
                </p>
              </Box>

              <div className="notifications-two-col">
                <Box className="notifications-card" style={{ padding: "20px 22px", borderColor: "var(--line)", borderRadius: 14 }}>
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

                <Box className="notifications-card" style={{ padding: "20px 22px", borderColor: "var(--line)", borderRadius: 14 }}>
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
                  </div>

                  <div className="notifications-rule">
                    <strong className="notifications-rule__title">Push notifications</strong>
                    <p className="notifications-rule__copy">
                      Push alerts go to any device where you are signed in and
                      have allowed notifications — no per-device setup needed.
                    </p>
                  </div>
                </Box>
              </div>
            </div>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}
