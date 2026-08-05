import { useEffect, useMemo, useState } from "react";

import { Alert, Box, Button } from "../components/ui";
import { WorkspaceShell } from "./business";

import "./operations.css";

// ─── Helpers ───

function clock(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(mm / 60);
  const min = mm % 60;
  const ap = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return min ? `${hr}:${String(min).padStart(2, "0")}${ap}` : `${hr}${ap}`;
}

function span(m: number): string {
  const a = Math.abs(m);
  const h = Math.floor(a / 60);
  const min = a % 60;
  if (a < 60) return `${min}m`;
  if (!min) return `${h}h`;
  return `${h}h ${min}m`;
}

function dayLabel(off: number): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const base = new Date(2026, 6, 30 + off);
  const month = base.toLocaleString("en-GB", { month: "short" });
  return `${off === 0 ? "Today · " : ""}${days[base.getDay()]} ${base.getDate()} ${month}`;
}

// ─── Bookings ───

interface Resource {
  name: string;
  sub: string;
  kind: "Person" | "Thing";
  hours: string;
  does: string;
}

interface Booking {
  id: string;
  r: number;
  s: number;
  d: number;
  t: string;
  w: string;
  src: "agent" | "desk" | "web" | null;
  k: "ok" | "done" | "hold" | "kept" | "block" | "missed" | "now" | "deposit";
  p?: string;
}

interface WaitEntry {
  name: string;
  want: string;
}

interface LogEntry {
  t: string;
  v: string;
}

const START = 480;
const END = 1200;
const NOW = 750;
const HOUR_HEIGHT = 84;
const TOTAL_HEIGHT = ((END - START) / 60) * HOUR_HEIGHT;

const RES: Resource[] = [
  { name: "Dr. Reyes", sub: "Dentist", kind: "Person", hours: "Mon–Thu 8:30–5:30, Fri to 1pm", does: "Everything except hygiene. Two emergency slots kept back each morning." },
  { name: "Dr. Osei", sub: "Dentist", kind: "Person", hours: "Tue–Sat, late Thursdays to 7:30", does: "Whitening and cosmetic work, plus general." },
  { name: "Aleks", sub: "Hygienist", kind: "Person", hours: "Mon–Fri 8–5", does: "Hygiene only, 30 minutes a head." },
  { name: "Surgery 2", sub: "Room", kind: "Thing", hours: "Open whenever the practice is", does: "Needed for X-rays and root canals. Booked on its own for the locum." },
];

const BOOKINGS: Booking[] = [
  { id: "b1", r: 0, s: 480, d: 20, t: "Check-up", w: "Ade Fashola", src: "desk", k: "done", p: "£45" },
  { id: "b2", r: 0, s: 540, d: 30, t: "Kept free", w: "Emergency slot", src: null, k: "kept" },
  { id: "b3", r: 0, s: 580, d: 45, t: "Implant consult", w: "Nadia Kaur", src: "agent", k: "done", p: "£90 · deposit paid" },
  { id: "b4", r: 0, s: 660, d: 60, t: "Crown fit", w: "Ben Lyle", src: "desk", k: "done", p: "£620" },
  { id: "b5", r: 0, s: 780, d: 45, t: "Lunch", w: "", src: null, k: "block" },
  { id: "b6", r: 0, s: 840, d: 20, t: "Check-up", w: "Joyce Amadi", src: "agent", k: "done", p: "£45" },
  { id: "b7", r: 0, s: 920, d: 20, t: "Emergency", w: "Marcus Bell", src: "agent", k: "hold", p: "£80" },
  { id: "b8", r: 0, s: 1020, d: 20, t: "Check-up", w: "Ruth Kelly", src: "desk", k: "ok", p: "£45" },
  { id: "c1", r: 1, s: 540, d: 45, t: "Whitening consult", w: "Elena Fox", src: "web", k: "done", p: "£50" },
  { id: "c2", r: 1, s: 660, d: 20, t: "Check-up", w: "Dan Price", src: "desk", k: "missed", p: "£45" },
  { id: "c3", r: 1, s: 720, d: 60, t: "Root canal", w: "Sam Oyelaran", src: "desk", k: "done", p: "£480" },
  { id: "c4", r: 1, s: 870, d: 20, t: "Check-up", w: "Iris Bhatt", src: "agent", k: "now", p: "£45" },
  { id: "c5", r: 1, s: 990, d: 30, t: "Filling", w: "Hugo Marsh", src: "agent", k: "deposit", p: "£140" },
  { id: "c6", r: 1, s: 1110, d: 45, t: "Whitening", w: "Tom Whitaker", src: "agent", k: "ok", p: "£320 · deposit paid" },
  { id: "d1", r: 2, s: 480, d: 30, t: "Hygiene", w: "Grace Odum", src: "desk", k: "done", p: "£75" },
  { id: "d2", r: 2, s: 540, d: 30, t: "Hygiene", w: "Peter Vance", src: "agent", k: "done", p: "£75" },
  { id: "d3", r: 2, s: 660, d: 30, t: "Hygiene", w: "Nina Roche", src: "agent", k: "done", p: "£75" },
  { id: "d4", r: 2, s: 780, d: 30, t: "Lunch", w: "", src: null, k: "block" },
  { id: "d5", r: 2, s: 900, d: 30, t: "Hygiene", w: "Yusuf Adeyemi", src: "desk", k: "ok", p: "£75" },
  { id: "d6", r: 2, s: 990, d: 30, t: "Hygiene", w: "Ola Mensah", src: "agent", k: "deposit", p: "£75" },
  { id: "e1", r: 3, s: 540, d: 120, t: "Locum clinic", w: "Dr. Iqbal", src: "desk", k: "done" },
  { id: "e2", r: 3, s: 840, d: 60, t: "Deep clean", w: "", src: null, k: "block" },
  { id: "e3", r: 3, s: 1080, d: 120, t: "Evening clinic", w: "Dr. Osei", src: "desk", k: "ok" },
];

const SERVICES = [
  { name: "Check-up", who: "Dr. Reyes, Dr. Osei", dur: "20 min", buffer: "5 min", price: "£45", deposit: "None", agent: true },
  { name: "Hygiene", who: "Aleks", dur: "30 min", buffer: "5 min", price: "£75", deposit: "None", agent: true },
  { name: "Emergency", who: "Whoever is free", dur: "20 min", buffer: "10 min", price: "£80", deposit: "None", agent: true },
  { name: "Whitening", who: "Dr. Osei", dur: "45 min", buffer: "15 min", price: "£320", deposit: "£50", agent: true },
  { name: "Root canal", who: "Dr. Osei + Surgery 2", dur: "60 min", buffer: "15 min", price: "£480", deposit: "£100", agent: false },
  { name: "Implant consult", who: "Dr. Reyes", dur: "45 min", buffer: "10 min", price: "£90", deposit: "£90", agent: true },
];

const AVAIL = [
  { k: "Opening hours", v: "Mon–Fri 8:00–6:00, late Thursday to 7:30, Sat 9–2" },
  { k: "Slot granularity", v: "10 minutes" },
  { k: "How far ahead", v: "Up to 16 weeks" },
  { k: "How last-minute", v: "Nothing inside 2 hours, except emergencies" },
  { k: "Held back", v: "Two emergency slots each morning, released at 11am" },
];

const POLICY = [
  { k: "Cancellation", v: "24 hours, or the deposit is kept" },
  { k: "Deposits", v: "Anything over £300, and anyone with two no-shows" },
  { k: "No-shows", v: "Flagged on the contact, front desk told, slot offered to the waitlist" },
  { k: "Reminders", v: "Text 48 hours before, then the morning of" },
  { k: "Without a card", v: "Plan members and anyone who has been in before" },
];

const WAIT: WaitEntry[] = [
  { name: "Nina Roche", want: "Hygiene · any afternoon this week" },
  { name: "Callum Ford", want: "Check-up · Thursday evening only" },
  { name: "Marta Silva", want: "Whitening · first free Saturday" },
];

const LOG: LogEntry[] = [
  { t: "14:31", v: "Booked Iris Bhatt into the 2:30 check-up" },
  { t: "13:58", v: "Moved Hugo Marsh from Tuesday to 4:30 today" },
  { t: "11:20", v: "Dan Price did not arrive — front desk told, slot offered out" },
  { t: "09:12", v: "Added Callum Ford to the waitlist, no Thursday evening left" },
];

type BookingKind = "ok" | "done" | "agentok" | "now" | "deposit" | "hold" | "missed" | "kept" | "block";

function blockKind(b: Booking, holdState: "live" | "taken" | "expired" | "gone"): BookingKind | null {
  let kind: BookingKind = b.k;
  if (kind === "hold") {
    if (holdState === "taken") kind = "agentok";
    else if (holdState === "expired") kind = "kept";
    else if (holdState === "gone") return null;
  }
  if (kind === "ok" && b.src === "agent") kind = "agentok";
  return kind;
}

function rawBookings(off: number, cancelled: Set<string>): Booking[] {
  let list = BOOKINGS.filter((b) => !cancelled.has(b.id));
  if (off === 0) return list;
  return list
    .filter((_, i) => (i + Math.abs(off)) % 3 !== 0)
    .map((b, i) => {
      const sign = off > 0 ? 1 : -1;
      const shift = (i % 2 ? 20 : -10) * sign;
      const nb: Booking = { ...b, s: b.s + shift };
      if (b.k === "hold" || b.k === "now") nb.k = off < 0 ? "done" : "ok";
      else if (off < 0 && b.k !== "block" && b.k !== "kept" && b.k !== "missed") nb.k = "done";
      else if (off > 0 && b.k === "done") nb.k = "ok";
      return nb;
    });
}

export function WorkspaceBookingsPage() {
  const [tab, setTab] = useState<"Diary" | "Setup">("Diary");
  const [day, setDay] = useState(0);
  const [filter, setFilter] = useState<"all" | "agent" | "attn">("all");
  const [sel, setSel] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [holdLeft, setHoldLeft] = useState(88);
  const [holdState, setHoldState] = useState<"live" | "taken" | "expired" | "gone">("live");
  const [offered, setOffered] = useState<Set<string>>(new Set());
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Record<string, { r: number; s: number }>>({});
  const [freed, setFreed] = useState<string | null>(null);
  const [svcOff, setSvcOff] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    if (holdState !== "live") return;
    const id = window.setInterval(() => {
      setHoldLeft((n) => {
        if (n <= 1) {
          setHoldState("expired");
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [holdState]);

  const dayKey = (off: number, id: string) => `${off}:${id}`;

  const clash = (id: string, r: number, s: number, d: number): boolean => {
    return dayBookings.some((b) => {
      if (b.id === id) return false;
      const k = blockKind(b, holdState);
      if (!k || k === "kept") return false;
      return b.r === r && s < b.s + b.d && b.s < s + d;
    });
  };

  const place = (id: string, r: number, s: number) => {
    setMoved((prev) => ({ ...prev, [dayKey(day, id)]: { r, s } }));
  };

  const dayBookings = useMemo(() => {
    return rawBookings(day, cancelled).map((b) => {
      const m = moved[dayKey(day, b.id)];
      return m ? { ...b, ...m } : b;
    });
  }, [day, cancelled, moved]);

  const derived = useMemo(() => {
    const mapped = dayBookings
      .map((b) => {
        let kind = blockKind(b, holdState);
        if (arrived.has(b.id)) kind = "done";
        if (!kind) return null;
        return { ...b, kind };
      })
      .filter((b): b is Booking & { kind: BookingKind } => !!b);

    const dim = (b: Booking) => {
      if (filter === "agent") return b.src !== "agent";
      if (filter === "attn") return !["deposit", "missed", "hold", "kept"].includes(b.k);
      return false;
    };

    const cols = RES.map((_, ri) => mapped.filter((b) => b.r === ri));
    const booked = mapped.filter((b) => b.kind !== "block" && b.kind !== "kept");

    const stats = [
      { v: booked.length, k: "booked", c: "ops-stat__v" },
      { v: mapped.filter((b) => b.kind === "hold").length, k: "held", c: "ops-stat__v--warn" },
      { v: mapped.filter((b) => b.kind === "kept" || b.kind === "block").length, k: "kept free", c: "ops-stat__v" },
      { v: WAIT.length, k: "waitlist", c: "ops-stat__v--accent" },
    ];

    const selBooking = sel ? mapped.find((b) => b.id === sel) : undefined;

    return { cols, stats, selBooking, dim };
  }, [dayBookings, holdState, arrived, filter, sel]);

  const selected = derived.selBooking;

  const handleNudge = (m: number) => {
    if (!selected) return;
    const s2 = Math.max(START, Math.min(END - selected.d, selected.s + m));
    if (s2 === selected.s) return;
    if (clash(selected.id, selected.r, s2, selected.d)) {
      say("Something else is already there");
      return;
    }
    place(selected.id, selected.r, s2);
    say(`Nudged to ${clock(s2)}`);
  };

  const handleReassign = (r: number) => {
    if (!selected || r === selected.r) return;
    if (clash(selected.id, r, selected.s, selected.d)) {
      say(`${RES[r].name} is already booked then`);
      return;
    }
    place(selected.id, r, selected.s);
    say(`Now with ${RES[r].name} — patient texted`);
  };

  const handleArrived = () => {
    if (!selected) return;
    setArrived((prev) => new Set([...prev, selected.id]));
    say("Marked as arrived");
  };

  const handleCancel = () => {
    if (!selected) return;
    setCancelled((prev) => new Set([...prev, selected.id]));
    setFreed(`${clock(selected.s)} with ${RES[selected.r].name}`);
    setSel(null);
    say("Cancelled — the waitlist has been told");
  };

  const handleConfirmHold = () => {
    setHoldState("taken");
    say("Booked — Marcus Bell, 3:20pm");
  };

  const handleReleaseHold = () => {
    setHoldState("gone");
    setFreed(`3:20pm with Dr. Reyes`);
    say("Slot released");
  };

  const sourceTag = (b: Booking) => {
    if (b.k === "missed") return { text: "DID NOT ARRIVE", cls: "bookings-detail__tag", style: { color: "var(--accent-ink)", background: "var(--accent-soft)", borderColor: "var(--accent)" } };
    if (b.src === "agent")
      return { text: "BOOKED BY THE AGENT", cls: "bookings-detail__tag", style: { color: "var(--good)", background: "var(--good-soft)", borderColor: "var(--good)" } };
    if (b.src === "web")
      return { text: "BOOKED ON THE WEBSITE", cls: "bookings-detail__tag", style: { color: "var(--ink-2)", background: "var(--paper-2)", borderColor: "var(--line)" } };
    return { text: "BOOKED AT THE DESK", cls: "bookings-detail__tag", style: { color: "var(--ink-2)", background: "var(--paper-2)", borderColor: "var(--line)" } };
  };

  const showHold = tab === "Diary" && day === 0 && holdState !== "gone" && !sel;

  const holdClock = holdState === "taken" ? "confirmed" : holdState === "expired" ? "expired" : `${Math.floor(holdLeft / 60)}:${String(holdLeft % 60).padStart(2, "0")}`;

  return (
    <WorkspaceShell>
      {(business) => (
        <>
          <Alert variant="warn">
            Design preview — the bookings diary shows sample data while the booking backend is being built.
          </Alert>

          <div className="ops-page">
            <div className="ops-main">
              <div className="ops-header">
                <div className="ops-header__row">
                  <div className="ops-header__left">
                    <h1 className="ops-title">Bookings</h1>
                    <div className="ops-tabs">
                      <button
                        type="button"
                        className={`ops-tab ${tab === "Diary" ? "ops-tab--active" : ""}`}
                        onClick={() => {
                          setTab("Diary");
                          setSel(null);
                        }}
                      >
                        Diary
                      </button>
                      <button
                        type="button"
                        className={`ops-tab ${tab === "Setup" ? "ops-tab--active" : ""}`}
                        onClick={() => {
                          setTab("Setup");
                          setSel(null);
                        }}
                      >
                        Setup
                      </button>
                    </div>
                  </div>
                  <div className="ops-toolbar">
                    {tab === "Diary" && (
                      <div className="ops-day">
                        <button type="button" className="ops-step" onClick={() => setDay((d) => d - 1)}>
                          ←
                        </button>
                        <span className="ops-day__label">{dayLabel(day)}</span>
                        <button type="button" className="ops-step" onClick={() => setDay((d) => d + 1)}>
                          →
                        </button>
                        <Button variant="default" onClick={() => setDay(0)}>
                          Today
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="primary"
                      onClick={() => say("New booking — pick a service, then a person")}
                    >
                      New booking
                    </Button>
                  </div>
                </div>

                {tab === "Diary" && (
                  <div className="ops-header__row">
                    <div className="ops-stats">
                      {derived.stats.map((s) => (
                        <div className="ops-stat" key={s.k}>
                          <span className={`ops-stat__v ${s.c}`}>{s.v}</span>
                          <span className="ops-stat__k">{s.k}</span>
                        </div>
                      ))}
                    </div>
                    <div className="ops-toolbar">
                      {(["all", "agent", "attn"] as const).map((f) => (
                        <button
                          type="button"
                          key={f}
                          className={`ops-chip ${filter === f ? "ops-chip--active" : ""}`}
                          onClick={() => setFilter(f)}
                        >
                          {f === "all" ? "Everything" : f === "agent" ? "Agent booked" : "Needs a look"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {tab === "Diary" ? (
                <div className="bookings-grid-wrap">
                  <div className="bookings-grid" style={{ height: 44 + TOTAL_HEIGHT }}>
                    <div className="bookings-grid__head--gutter" />
                    {RES.map((r) => (
                      <div className="bookings-grid__head" key={r.name}>
                        <span className="bookings-grid__name">{r.name}</span>
                        <span className="bookings-grid__sub">{r.sub}</span>
                      </div>
                    ))}

                    <div className="bookings-gutter" style={{ height: TOTAL_HEIGHT }}>
                      {Array.from({ length: (END - START) / 60 }, (_, i) => (
                        <span
                          key={i}
                          className="bookings-hour"
                          style={{ top: i * HOUR_HEIGHT }}
                        >
                          {clock(START + i * 60)}
                        </span>
                      ))}
                    </div>

                    {derived.cols.map((col, ri) => (
                      <div className="bookings-track" key={ri} style={{ height: TOTAL_HEIGHT }}>
                        {col.map((b) => {
                          const h = Math.max(20, (b.d / 60) * HOUR_HEIGHT - 4);
                          const compact = h < 46;
                          const top = ((b.s - START) / 60) * HOUR_HEIGHT;
                          const dim = derived.dim(b);
                          const selected = sel === b.id;
                          const className = [
                            "bookings-block",
                            `bookings-block--${b.kind}`,
                            compact ? "bookings-block--compact" : "",
                            selected ? "bookings-block--selected" : "",
                            dim ? "bookings-block--dim" : "",
                          ].join(" ");

                          const onClick = b.kind === "block" ? undefined : () => setSel(b.id);

                          return (
                            <button
                              type="button"
                              key={b.id}
                              className={className}
                              style={{ top, height: h }}
                              onClick={onClick}
                            >
                              {b.kind !== "block" && (
                                <span className="bookings-block__time">{clock(b.s)}</span>
                              )}
                              <span className="bookings-block__title">
                                {compact ? (b.w ? `${b.t} · ${b.w}` : b.t) : b.t}
                              </span>
                              {!compact && b.kind !== "block" && b.w && (
                                <span className="bookings-block__sub">{b.w}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}

                    {day === 0 && (
                      <div className="bookings-now" style={{ top: 44 + ((NOW - START) / 60) * HOUR_HEIGHT }}>
                        <span className="bookings-now__label">{clock(NOW)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bookings-setup">
                  <div className="bookings-table-wrap">
                    <div className="ops-header__row" style={{ padding: 0, border: 0, marginBottom: 4 }}>
                      <h2>Services</h2>
                    </div>
                    <p>Turn one off and the agent will offer a callback instead of a slot.</p>
                    <div className="bookings-table">
                      <div className="bookings-table__head">
                        <span className="bookings-th">Service</span>
                        <span className="bookings-th">Time</span>
                        <span className="bookings-th">Buffer</span>
                        <span className="bookings-th">Price</span>
                        <span className="bookings-th">Deposit</span>
                        <span className="bookings-th">Agent may book</span>
                      </div>
                      {SERVICES.map((s) => {
                        const on = s.agent ? !svcOff.has(s.name) : svcOff.has(s.name);
                        return (
                          <div className="bookings-table__row" key={s.name}>
                            <span>
                              <span className="bookings-service__name">{s.name}</span>
                              <span className="bookings-service__who">{s.who}</span>
                            </span>
                            <span className="bookings-td">{s.dur}</span>
                            <span className="bookings-td">{s.buffer}</span>
                            <span className="bookings-td">{s.price}</span>
                            <span className="bookings-td">{s.deposit}</span>
                            <button
                              type="button"
                              className={`bookings-toggle ${on ? "bookings-toggle--on" : "bookings-toggle--off"}`}
                              onClick={() =>
                                setSvcOff((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(s.name)) next.delete(s.name);
                                  else next.add(s.name);
                                  return next;
                                })
                              }
                            >
                              {on ? "Yes" : "Only humans"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bookings-cards">
                    {RES.map((r) => (
                      <div className="bookings-card" key={r.name}>
                        <span className="bookings-card__kind">{r.kind}</span>
                        <span className="bookings-card__name">{r.name}</span>
                        <span className="bookings-card__line">{r.hours}</span>
                        <span className="bookings-card__muted">{r.does}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bookings-pair">
                    <Box tone="tinted" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      <span className="bookings-section-label">Availability</span>
                      {AVAIL.map((a) => (
                        <div className="bookings-kv" key={a.k}>
                          <span className="bookings-kv__k">{a.k}</span>
                          <span className="bookings-kv__v">{a.v}</span>
                        </div>
                      ))}
                    </Box>
                    <Box tone="tinted" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      <span className="bookings-section-label">Policies</span>
                      {POLICY.map((a) => (
                        <div className="bookings-kv" key={a.k}>
                          <span className="bookings-kv__k">{a.k}</span>
                          <span className="bookings-kv__v">{a.v}</span>
                        </div>
                      ))}
                    </Box>
                  </div>

                  <div className="bookings-note">
                    <span className="bookings-note__label">Diary source</span>
                    <span className="bookings-note__line">Vocalonix is the diary. PMS mirrors it.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="ops-rail">
              {tab === "Diary" && selected && (
                <div className="bookings-detail">
                  <div className="bookings-detail__head">
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                      <span className={sourceTag(selected).cls} style={sourceTag(selected).style}>
                        {sourceTag(selected).text}
                      </span>
                      <h2 className="bookings-detail__title">{selected.w}</h2>
                      <span className="bookings-detail__when">
                        {clock(selected.s)}–{clock(selected.s + selected.d)} · {dayLabel(day).replace("Today · ", "")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="bookings-detail__close"
                      onClick={() => {
                        setSel(null);
                        setMoveOpen(false);
                      }}
                      style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-4)" }}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="bookings-detail__facts">
                    {[
                      { k: "service", v: `${selected.t} · ${selected.d} min` },
                      { k: "with", v: RES[selected.r].name },
                      { k: "price", v: selected.p || "—" },
                      { k: "history", v: selected.src === "agent" ? "Taken on a call, no one at the desk touched it" : "Entered by the front desk" },
                    ].map((f) => (
                      <div className="bookings-fact" key={f.k}>
                        <span className="bookings-fact__k">{f.k}</span>
                        <span className="bookings-fact__v">{f.v}</span>
                      </div>
                    ))}
                  </div>

                  {selected.kind !== "kept" && (
                    <>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <Button variant="default" onClick={() => setMoveOpen((o) => !o)}>
                          {moveOpen ? "Done" : "Move"}
                        </Button>
                        <Button variant="default" onClick={handleArrived}>
                          Mark arrived
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleCancel}
                        >
                          Cancel
                        </Button>
                      </div>

                      {moveOpen && (
                        <div className="bookings-move">
                          <span style={{ fontSize: 16, color: "var(--ink-4)" }}>
                            Drag the block in the diary, or nudge it here.
                          </span>
                          <div className="bookings-nudge">
                            <Button variant="default" onClick={() => handleNudge(-10)}>−10 min</Button>
                            <span className="bookings-nudge__time">{clock(selected.s)}</span>
                            <Button variant="default" onClick={() => handleNudge(10)}>+10 min</Button>
                          </div>
                          <div className="bookings-people">
                            {RES.map((r, i) => (
                              <button
                                type="button"
                                key={r.name}
                                className={`ops-chip ${i === selected.r ? "ops-chip--active" : ""}`}
                                onClick={() => handleReassign(i)}
                              >
                                {r.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bookings-detail__links">
                        <a href={`/app/${business.slug}/contacts`}>Open contact</a>
                        <a href={`/app/${business.slug}/conversations`}>Hear the call</a>
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === "Diary" && showHold && (
                <div className="bookings-hold">
                  <div className="bookings-hold__head">
                    <span className="bookings-hold__label">Slot held — caller deciding</span>
                    <span className="bookings-hold__clock">{holdClock}</span>
                  </div>
                  <span className="bookings-hold__name">Marcus Bell · 3:20pm</span>
                  <span className="bookings-hold__line">
                    {holdState === "expired"
                      ? "The hold ran out and the slot went back into the diary."
                      : holdState === "taken"
                        ? "Confirmed. A text is on its way."
                        : "The agent is on the phone with him now. Nobody else can take 3:20 until this clears."}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button variant="primary" onClick={handleConfirmHold}>
                      Confirm it
                    </Button>
                    <Button variant="default" onClick={handleReleaseHold}>
                      Release
                    </Button>
                  </div>
                </div>
              )}

              {tab === "Diary" && (
                <>
                  <div className="bookings-waitlist">
                    <div className="bookings-waitlist__head">
                      <span className="bookings-section-label">Waiting for a slot</span>
                      <span className="bookings-count">{WAIT.length} waiting</span>
                    </div>
                    {freed && <div className="bookings-freed">{freed} just opened up. Offer it to somebody?</div>}
                    {WAIT.map((w) => {
                      const done = offered.has(w.name);
                      return (
                        <div className="bookings-wait" key={w.name}>
                          <span>
                            <span className="bookings-wait__name">{w.name}</span>
                            <span className="bookings-wait__want">{w.want}</span>
                          </span>
                          <Button
                            variant={done ? "default" : "primary"}
                            onClick={() =>
                              setOffered((prev) => {
                                const next = new Set(prev);
                                if (done) next.delete(w.name);
                                else next.add(w.name);
                                return next;
                              })
                            }
                          >
                            {done ? "Sent" : "Offer"}
                          </Button>
                        </div>
                      );
                    })}
                    <a href={`/app/${business.slug}/callbacks`} className="bookings-rail__link">Callback queue for these ↗</a>
                  </div>

                  <div className="bookings-log">
                    <span className="bookings-section-label">What the agent did today</span>
                    {LOG.map((l) => (
                      <div className="bookings-log__row" key={l.v}>
                        <span className="bookings-log__time">{l.t}</span>
                        <span className="bookings-log__line">{l.v}</span>
                      </div>
                    ))}
                    <a href={`/app/${business.slug}/conversations`} className="bookings-rail__link">All conversations ↗</a>
                  </div>
                </>
              )}
            </div>
          </div>

          {toast && <div className="ops-toast">{toast}</div>}
        </>
      )}
    </WorkspaceShell>
  );
}

// ─── Callbacks ───

type CallbackSrc = "call" | "waitlist" | "noshow" | "deposit" | "hand";
type CallbackKind = "open" | "spoke" | "voicemail" | "dropped";

interface Callback {
  id: string;
  who: string;
  ch: string;
  src: CallbackSrc;
  promised: boolean;
  day: number;
  due: number;
  assignee: string | null;
  why: string;
  made: string;
  hist: string;
  tries: { t: string; v: string }[];
  links: string[];
  state?: CallbackKind;
  closedAt?: string;
}

const CALLBACKS: Callback[] = [
  { id: "k1", who: "Dawn Whitfield", ch: "+44 7900 812 004", src: "call", promised: true, day: 0, due: 750, assignee: "Priya", why: "Unhappy about a crown fitted last month. Robin took the details and promised a call today.", made: "Yesterday 18:30 · 3m 12s", hist: "4th visit · flagged as upset", tries: [{ t: "09:10", v: "Priya rang — no answer, no voicemail left" }], links: ["call", "contact"] },
  { id: "w2", who: "Nina Roche", ch: "+44 7700 900 118", src: "waitlist", promised: false, day: 0, due: 900, assignee: null, why: "On the waitlist for hygiene, any afternoon. The 3:20 with Aleks came free — hers until 3pm.", made: "Added to the waitlist Monday", hist: "2nd visit · never missed one", tries: [], links: ["booking", "contact"] },
  { id: "k3", who: "Anna Pryce", ch: "+44 7412 660 118", src: "call", promised: true, day: 0, due: 960, assignee: "You", why: "Wanted to know if you take Bupa. Robin had no answer, so it took her number instead.", made: "Today 09:14 · 1m 48s", hist: "First time calling", tries: [], links: ["call", "knowledge", "contact"] },
  { id: "d1", who: "Hugo Marsh", ch: "+44 7508 221 340", src: "deposit", promised: false, day: 0, due: 1005, assignee: "You", why: "Filling on Friday with no deposit paid. Policy wants a card before we hold the slot.", made: "Booked by Robin 13:58", hist: "3rd visit · one late cancellation", tries: [], links: ["booking", "contact"] },
  { id: "k2", who: "Elena Fox", ch: "elena.fox@gmail.com", src: "call", promised: true, day: 0, due: 1020, assignee: null, why: "Asked what Invisalign costs — above the price Robin is allowed to quote out loud.", made: "Yesterday 17:55 · from the website button", hist: "Website visitor · no visits yet", tries: [], links: ["call", "contact"] },
  { id: "n1", who: "Dan Price", ch: "+44 7900 447 201", src: "noshow", promised: false, day: 0, due: 1050, assignee: "Priya", why: "Did not arrive for his 11:00 check-up. Needs rebooking, and the deposit rule now applies to him.", made: "Marked as a no-show 11:20", hist: "5th visit · second no-show", tries: [], links: ["booking", "contact"] },
  { id: "w1", who: "Callum Ford", ch: "+44 7311 508 662", src: "waitlist", promised: false, day: 1, due: 540, assignee: "Marta", why: "Waiting on a Thursday evening check-up. Dr. Osei has one late slot left next week.", made: "Added to the waitlist 09:12", hist: "2nd visit", tries: [], links: ["booking", "contact"] },
  { id: "h1", who: "Ray Boland", ch: "+44 7822 119 003", src: "hand", promised: false, day: 1, due: 660, assignee: "Marta", why: "Asked for the practice manager by name and would not say what it was about.", made: "Added by Priya at the desk", hist: "No record — possibly not a patient", tries: [], links: ["contact"] },
  { id: "p1", who: "Peter Vance", ch: "+44 7700 331 884", src: "call", promised: false, day: 1, due: 960, assignee: "Priya", why: "Wants his hygiene appointment moved. Rung twice, no answer either time.", made: "Today 08:41 · 2m 05s", hist: "6th visit · plan member", tries: [{ t: "10:02", v: "Priya rang — no answer" }, { t: "12:40", v: "Priya rang — no answer, voicemail full" }], links: ["call", "contact"] },
  { id: "w3", who: "Marta Silva", ch: "+44 7455 620 771", src: "waitlist", promised: false, day: 3, due: 600, assignee: null, why: "Wants the first free Saturday for whitening. Nothing open until the 22nd.", made: "Added to the waitlist last Friday", hist: "First time booking", tries: [], links: ["booking", "contact"] },
  { id: "z1", who: "Grace Odum", ch: "+44 7900 118 552", src: "call", promised: true, day: 0, due: 700, assignee: "Priya", state: "spoke", closedAt: "11:40", why: "Asked to move next week’s hygiene. Moved to Tuesday 4:00 while she was on the phone.", made: "Today 08:12 · 1m 32s", hist: "7th visit", tries: [{ t: "11:40", v: "Priya spoke to her — rebooked for Tuesday" }], links: ["call", "booking"] },
  { id: "z2", who: "Yusuf Adeyemi", ch: "+44 7500 664 019", src: "call", promised: false, day: 0, due: 600, assignee: "You", state: "voicemail", closedAt: "09:52", why: "Wanted his Saturday hygiene changed. Voicemail left with two times to pick from.", made: "Yesterday 16:20 · 2m 44s", hist: "3rd visit", tries: [{ t: "09:52", v: "You left a voicemail with two options" }], links: ["call", "contact"] },
];

const PEOPLE = [
  { key: "You", label: "You", sub: "Owner" },
  { key: "Priya", label: "Priya", sub: "Front desk" },
  { key: "Marta", label: "Marta", sub: "Front desk" },
  { key: "Robin", label: "Robin", sub: "The agent" },
];

const SRC: Record<CallbackSrc, { text: string; cls: string }> = {
  call: { text: "FROM A CALL", cls: "callbacks-tag--call" },
  waitlist: { text: "FROM THE WAITLIST", cls: "callbacks-tag--waitlist" },
  noshow: { text: "DID NOT ARRIVE", cls: "callbacks-tag--noshow" },
  deposit: { text: "DEPOSIT UNPAID", cls: "callbacks-tag--deposit" },
  hand: { text: "ADDED BY HAND", cls: "callbacks-tag--hand" },
};

const LINKS: Record<string, { label: string; path: string }> = {
  call: { label: "The call ↗", path: "conversations" },
  booking: { label: "The booking ↗", path: "bookings" },
  contact: { label: "Contact ↗", path: "contacts" },
  knowledge: { label: "The gap ↗", path: "settings/knowledge#gaps" },
};

const CBNOW = 884;
const ME = "You";

const GROUPS: [string, string, string][] = [
  ["late", "Late — already promised", "var(--accent)"],
  ["soon", "Within the hour", "var(--warn)"],
  ["today", "Later today", "var(--ink-4)"],
  ["ahead", "Tomorrow and after", "var(--ink-4)"],
  ["closed", "Closed today", "var(--good)"],
];

export function WorkspaceCallbacksPage() {
  const [filter, setFilter] = useState<"all" | "mine" | "unassigned" | "overdue" | "waitlist">("all");
  const [showDone, setShowDone] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, string | null>>({});
  const [stateMap, setStateMap] = useState<Record<string, CallbackKind>>({});
  const [dueOv, setDueOv] = useState<Record<string, number>>({});
  const [extraTries, setExtraTries] = useState<Record<string, { t: string; v: string }[]>>({});
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  };

  const allRows = useMemo(() => {
    return CALLBACKS.map((t) => {
      const kind = stateMap[t.id] ?? t.state ?? "open";
      const abs = dueOv[t.id] !== undefined ? dueOv[t.id] : t.day * 1440 + t.due;
      const owner = assign[t.id] !== undefined ? assign[t.id] : t.assignee;
      const allTries = t.tries.concat(extraTries[t.id] ?? []);
      const diff = abs - CBNOW;
      const closed = kind === "spoke" || kind === "voicemail" || kind === "dropped";
      let bucket: "late" | "soon" | "today" | "ahead" | "closed" = "today";
      if (closed) bucket = "closed";
      else if (diff < 0) bucket = "late";
      else if (diff <= 60) bucket = "soon";
      else if (abs >= 1440) bucket = "ahead";
      return { ...t, kind, abs, owner, allTries, diff, closed, bucket };
    });
  }, [assign, stateMap, dueOv, extraTries]);

  const open = allRows.filter((r) => !r.closed);
  const late = open.filter((r) => r.diff < 0);
  const un = open.filter((r) => !r.owner);
  const closedToday = allRows.filter((r) => r.kind === "spoke" || r.kind === "voicemail");

  const filtered = useMemo(() => {
    let list = allRows;
    if (filter === "mine") list = list.filter((r) => r.owner === ME);
    else if (filter === "unassigned") list = list.filter((r) => !r.owner && !r.closed);
    else if (filter === "overdue") list = list.filter((r) => !r.closed && r.diff < 0);
    else if (filter === "waitlist") list = list.filter((r) => r.src === "waitlist");
    if (!showDone) list = list.filter((r) => !r.closed);
    return list;
  }, [allRows, filter, showDone]);

  const groups = GROUPS.map(([key, label, color]) => {
    const items = filtered.filter((r) => r.bucket === key).sort((a, b) => a.abs - b.abs);
    if (!items.length) return null;
    return { key, label, color, count: `${items.length} ${key === "closed" ? "done" : "waiting"}`, items };
  }).filter((g): g is NonNullable<typeof g> => g !== null);

  const selected = allRows.find((r) => r.id === sel);

  const handleAssign = (key: string) => {
    if (!selected) return;
    setAssign((prev) => ({ ...prev, [selected.id]: key || null }));
    say(key ? (key === "Robin" ? "Robin will ring out from your number" : `${key} has it now`) : "Back in the shared pile");
  };

  const handleSetDue = (at: number, label: string) => {
    if (!selected) return;
    setDueOv((prev) => ({ ...prev, [selected.id]: at }));
    say(`Due ${clock(at)}${at >= 1440 ? " tomorrow" : ""}`);
  };

  const close = (kind: CallbackKind, msg: string) => {
    if (!selected) return;
    setStateMap((prev) => ({ ...prev, [selected.id]: kind }));
    say(msg);
  };

  const handleSpoke = () => close("spoke", `${selected?.who} — done, and written on the contact`);
  const handleVoicemail = () => close("voicemail", "Message left — back tomorrow if they do not ring");
  const handleDrop = () => close("dropped", "Dropped — taken off the queue");

  const handleNoAnswer = () => {
    if (!selected) return;
    const n = selected.allTries.length + 1;
    setExtraTries((prev) => ({
      ...prev,
      [selected.id]: (prev[selected.id] ?? []).concat([{ t: clock(CBNOW), v: `${selected.owner || "Somebody"} rang — no answer` }]),
    }));
    setDueOv((prev) => ({ ...prev, [selected.id]: CBNOW + 45 }));
    say(n === 3 ? "Third miss — try a text instead" : `No answer — back in the queue for ${clock(CBNOW + 45)}`);
  };

  const handleHandBack = () => {
    if (!selected) return;
    setAssign((prev) => ({ ...prev, [selected.id]: "Robin" }));
    say(`Robin will ring ${selected.who} and read the note back`);
  };

  const handleReopen = () => {
    if (!selected) return;
    setStateMap((prev) => {
      const next = { ...prev };
      delete next[selected.id];
      return next;
    });
    say(`${selected.who} is back in the queue`);
  };

  const sweep = () => {
    if (!un.length) {
      say("Everything already has a name on it");
      return;
    }
    const next: Record<string, string> = {};
    un.forEach((r, i) => {
      next[r.id] = ["Priya", "Marta", "You"][i % 3];
    });
    setAssign((prev) => ({ ...prev, ...next }));
    say(`${un.length} shared between Priya, Marta and you`);
  };

  const dueLabel = (r: typeof allRows[0]) => clock(r.abs);

  const relLabel = (r: typeof allRows[0]) => {
    if (r.kind === "spoke") return `done ${r.closedAt}`;
    if (r.kind === "voicemail") return "message left";
    if (r.kind === "dropped") return "dropped";
    const d = Math.floor(r.abs / 1440);
    if (d === 1) return "tomorrow";
    if (d > 1) return `in ${d} days`;
    if (r.diff < 0) return `${span(r.diff)} late`;
    return `in ${span(r.diff)}`;
  };

  const load = PEOPLE.map((p) => {
    const mine = open.filter((r) => r.owner === p.key);
    const l = mine.filter((r) => r.diff < 0).length;
    const next = [...mine].sort((a, b) => a.abs - b.abs)[0];
    return {
      ...p,
      mine,
      l,
      next,
      count: mine.length ? String(mine.length) : "—",
    };
  }).concat([
    {
      key: "",
      label: "Nobody yet",
      sub: "",
      mine: un,
      l: un.filter((r) => r.diff < 0).length,
      next: [...un].sort((a, b) => a.abs - b.abs)[0],
      count: un.length ? String(un.length) : "—",
    },
  ]);

  const maxLoad = Math.max(1, ...load.map((m) => m.mine.length));
  const fillColors = ["var(--accent-ink)", "var(--accent)", "var(--warn)", "var(--good)", "var(--accent-soft)"];

  const sources = [
    { n: allRows.filter((r) => r.src === "call").length, v: "Robin took a number on a call" },
    { n: allRows.filter((r) => r.src === "waitlist").length, v: "Waiting for a slot in the diary" },
    { n: allRows.filter((r) => r.src === "noshow" || r.src === "deposit").length, v: "Booking rules — no-shows and deposits" },
    { n: allRows.filter((r) => r.src === "hand").length, v: "Added at the desk by hand" },
  ];

  const emptyTitle = filter === "overdue" ? "Nothing is late" : filter === "unassigned" ? "Everything has an owner" : "Nothing here";
  const emptyLine =
    filter === "overdue"
      ? "Every promise still has time left on it."
      : filter === "unassigned"
        ? "Every open callback has somebody’s name on it."
        : "No callback matches that filter right now.";

  const dueOptions = [
    { key: "30", label: "In 30 min", at: CBNOW + 30 },
    { key: "5pm", label: "Before 5pm", at: 1020 },
    { key: "tom", label: "Tomorrow 9am", at: 1440 + 540 },
  ];

  return (
    <WorkspaceShell>
      {(business) => (
        <>
          <Alert variant="warn">
            Design preview — the callbacks queue shows sample data while the callback backend is being built.
          </Alert>

          <div className="ops-page">
            <div className="ops-main">
              <div className="ops-header">
                <div className="ops-header__row" style={{ alignItems: "flex-end" }}>
                  <div>
                    <h1 className="ops-title">Callbacks</h1>
                    <p className="ops-blurb">One queue. Robin fills it, the waitlist fills it, so does the front desk.</p>
                  </div>
                  <div className="ops-toolbar">
                    <Button variant="default" onClick={sweep}>
                      Share out the unassigned
                    </Button>
                    <Button variant="primary" onClick={() => say("New callback — pick a contact, then a time")}>
                      New callback
                    </Button>
                  </div>
                </div>

                <div className="ops-header__row">
                  <div className="ops-stats">
                    <div className="ops-stat">
                      <span className="ops-stat__v">{open.length}</span>
                      <span className="ops-stat__k">still waiting</span>
                    </div>
                    <div className="ops-stat">
                      <span className="ops-stat__v ops-stat__v--accent">{late.length}</span>
                      <span className="ops-stat__k">late</span>
                    </div>
                    <div className="ops-stat">
                      <span className="ops-stat__v ops-stat__v--warn">{un.length}</span>
                      <span className="ops-stat__k">nobody’s</span>
                    </div>
                    <div className="ops-stat">
                      <span className="ops-stat__v ops-stat__v--good">{closedToday.length}</span>
                      <span className="ops-stat__k">closed today</span>
                    </div>
                  </div>

                  <div className="ops-toolbar">
                    {(["all", "mine", "unassigned", "overdue", "waitlist"] as const).map((f) => (
                      <button
                        type="button"
                        key={f}
                        className={`ops-chip ${filter === f ? "ops-chip--active" : ""}`}
                        onClick={() => {
                          setFilter(f);
                          setSel(null);
                        }}
                      >
                        {f === "all"
                          ? "Everything"
                          : f === "mine"
                            ? "Mine"
                            : f === "unassigned"
                              ? "Nobody’s"
                              : f === "overdue"
                                ? "Late"
                                : "From the waitlist"}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`ops-chip ${showDone ? "ops-chip--active" : ""}`}
                      onClick={() => setShowDone((v) => !v)}
                    >
                      {showDone ? "Hiding nothing" : "Show closed"}
                    </button>
                  </div>
                </div>

                {(filter === "overdue" || late.length > 0) && (
                  <Alert variant="warn" title="Past the promise">
                    {late.length === 1
                      ? "One promise has gone past its time."
                      : `${late.length} promises have gone past their time.`}
                    {filter !== "overdue" && (
                      <button
                        type="button"
                        style={{ marginLeft: 12, textDecoration: "underline", background: "transparent", border: "none", cursor: "pointer", color: "var(--warn)", font: "inherit" }}
                        onClick={() => setFilter("overdue")}
                      >
                        Work through them
                      </button>
                    )}
                  </Alert>
                )}
              </div>

              <div className="callbacks-groups">
                {groups.length > 0 ? (
                  groups.map((g) => (
                    <div key={g.key}>
                      <div className="callbacks-group__head">
                        <span className="callbacks-group__label" style={{ color: g.color }}>
                          {g.label}
                        </span>
                        <span className="callbacks-group__count">{g.count}</span>
                      </div>
                      {g.items.map((r) => {
                        const on = sel === r.id;
                        const src = SRC[r.src];
                        return (
                          <button
                            type="button"
                            key={r.id}
                            className={[
                              "callbacks-row",
                              on ? "callbacks-row--selected" : "",
                              r.bucket === "late" ? "callbacks-row--late" : "",
                              r.closed ? "callbacks-row--closed" : "",
                            ].join(" ")}
                            onClick={() => setSel(r.id)}
                          >
                            <span className="callbacks-due">
                              <span
                                className={[
                                  "callbacks-due__time",
                                  r.bucket === "late" ? "callbacks-due__time--late" : "",
                                ].join(" ")}
                              >
                                {dueLabel(r)}
                              </span>
                              <span
                                className={[
                                  "callbacks-due__rel",
                                  r.bucket === "late" ? "callbacks-due__rel--late" : "",
                                  r.closed ? "callbacks-due__rel--closed" : "",
                                ].join(" ")}
                              >
                                {relLabel(r)}
                              </span>
                            </span>
                            <span className="callbacks-middle">
                              <span className="callbacks-topline">
                                <span className={["callbacks-name", r.closed ? "callbacks-name--closed" : ""].join(" ")}>{r.who}</span>
                                <span className={["callbacks-tag", src.cls].join(" ")}>{src.text}</span>
                                {r.promised && !r.closed && <span className="callbacks-promised">PROMISED OUT LOUD</span>}
                              </span>
                              <span className="callbacks-why">{r.why}</span>
                            </span>
                            <span className="callbacks-right">
                              {r.allTries.length > 0 && !r.closed && (
                                <span className="callbacks-attempts-tag">
                                  {r.allTries.length} {r.allTries.length === 1 ? "TRY" : "TRIES"}
                                </span>
                              )}
                              <span
                                className={[
                                  "callbacks-owner",
                                  r.owner ? "callbacks-owner--set" : "callbacks-owner--none",
                                ].join(" ")}
                              >
                                {r.owner || "nobody"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="callbacks-empty">
                    <span className="callbacks-empty__title">{emptyTitle}</span>
                    <span className="callbacks-empty__line">{emptyLine}</span>
                    <Button variant="default" onClick={() => setFilter("all")}>
                      Show everything
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="callbacks-rail">
              {selected ? (
                <div className="callbacks-detail">
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    <div className="callbacks-detail__head">
                      <span className={["callbacks-detail__tag", SRC[selected.src].cls].join(" ")}>
                        {SRC[selected.src].text}
                      </span>
                      <button
                        type="button"
                        className="callbacks-detail__close"
                        onClick={() => setSel(null)}
                      >
                        CLOSE ✕
                      </button>
                    </div>
                    <span className="callbacks-detail__who">{selected.who}</span>
                    <span className="callbacks-detail__channel">{selected.ch}</span>
                    <span className="callbacks-detail__why">{selected.why}</span>
                  </div>

                  <div className="callbacks-facts">
                    {[
                      { k: "asked", v: selected.made },
                      { k: "promised", v: selected.promised ? "Robin said somebody would ring today" : "No promise made out loud" },
                      { k: "history", v: selected.hist },
                      { k: "due back", v: `${dueLabel(selected)} · ${relLabel(selected)}` },
                    ].map((f) => (
                      <div className="callbacks-fact" key={f.k}>
                        <span className="callbacks-fact__k">{f.k}</span>
                        <span className="callbacks-fact__v">{f.v}</span>
                      </div>
                    ))}
                    <div className="callbacks-links">
                      {selected.links.map((k) => (
                        <a key={k} href={LINKS[k] ? `/app/${business.slug}/${LINKS[k].path}` : "/app"}>
                          {LINKS[k]?.label ?? k}
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className="callbacks-section">
                    <span className="callbacks-section__label">Whose job it is</span>
                    <div className="callbacks-chip-row">
                      {PEOPLE.concat({ key: "", label: "Nobody", sub: "" }).map((p) => (
                        <button
                          type="button"
                          key={p.key || "none"}
                          className={`ops-chip ${(selected.owner || "") === p.key ? "ops-chip--active" : ""}`}
                          onClick={() => handleAssign(p.key)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <span className="callbacks-note">
                      {selected.owner === "Robin"
                        ? "Robin dials out, reads the note, and hands over if they want a person."
                        : selected.owner
                          ? `Shows up in ${selected.owner}’s list, and on the shared queue.`
                          : "Nobody owns this yet — it sits in the shared pile."}
                    </span>
                  </div>

                  <div className="callbacks-section">
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <span className="callbacks-section__label">Due back</span>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 12,
                          color: !selected.closed && selected.diff < 0 ? "var(--accent)" : "var(--ink-4)",
                        }}
                      >
                        {dueLabel(selected)} · {relLabel(selected)}
                      </span>
                    </div>
                    <div className="callbacks-chip-row">
                      {dueOptions.map((d) => (
                        <button
                          type="button"
                          key={d.key}
                          className={`ops-chip ${selected.abs === d.at ? "ops-chip--active" : ""}`}
                          onClick={() => handleSetDue(d.at, d.label)}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="callbacks-attempts">
                    <span className="callbacks-section__label">Attempts</span>
                    {selected.allTries.length > 0 ? (
                      selected.allTries.map((a, i) => (
                        <div className="callbacks-attempt" key={i}>
                          <span className="callbacks-attempt__t">{a.t}</span>
                          <span className="callbacks-attempt__v">{a.v}</span>
                        </div>
                      ))
                    ) : (
                      <span className="callbacks-note">Nobody has tried yet.</span>
                    )}
                  </div>

                  {!selected.closed ? (
                    <div className="callbacks-actions">
                      <Button variant="primary" onClick={handleSpoke}>
                        Spoke to them — done
                      </Button>
                      <div className="callbacks-outcomes">
                        <Button variant="default" onClick={handleNoAnswer}>
                          No answer
                        </Button>
                        <Button variant="default" onClick={handleVoicemail}>
                          Left a message
                        </Button>
                        <Button variant="default" onClick={handleHandBack}>
                          Robin tries
                        </Button>
                      </div>
                      <button
                        type="button"
                        onClick={handleDrop}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: "4px 0",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: 16,
                          color: "var(--accent-ink)",
                          textDecoration: "underline",
                          fontFamily: "var(--kalam)",
                        }}
                      >
                        Not needed any more
                      </button>
                    </div>
                  ) : (
                    <div className="callbacks-closed">
                      <span className="callbacks-closed__line">
                        {selected.kind === "spoke"
                          ? `Spoke to them at ${selected.closedAt || "today"}. Logged on the contact, and the promise is cleared.`
                          : selected.kind === "voicemail"
                            ? `Message left at ${selected.closedAt || "today"}. It comes back if they have not rung by tomorrow.`
                            : "Dropped — nobody is expecting a call."}
                      </span>
                      <button type="button" className="callbacks-reopen" onClick={handleReopen}>
                        Put it back in the queue
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="callbacks-summary">
                  <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                    <span className="callbacks-section__label">Who is carrying what</span>
                    {load.map((m, i) => {
                      const lateCount = m.l;
                      const next = m.next;
                      return (
                        <div className="callbacks-load__item" key={m.label}>
                          <div className="callbacks-load__head">
                            <span className="callbacks-load__name">{`${m.label}${m.sub ? ` · ${m.sub}` : ""}`}</span>
                            <span
                              className={[
                                "callbacks-load__count",
                                lateCount ? "callbacks-load__count--late" : "",
                              ].join(" ")}
                            >
                              {m.count}
                            </span>
                          </div>
                          <div className="callbacks-load__bar">
                            <div
                              className="callbacks-load__fill"
                              style={{
                                width: `${Math.round((m.mine.length / maxLoad) * 100)}%`,
                                background: fillColors[i % fillColors.length],
                              }}
                            />
                          </div>
                          <span className="callbacks-load__note">
                            {!m.mine.length
                              ? "Nothing waiting"
                              : next
                                ? `${lateCount ? `${lateCount} late · ` : ""}next ${clock(next.abs)} · ${next.who}`
                                : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="callbacks-sources">
                    <span className="callbacks-sources__head">Where today’s came from</span>
                    {sources.map((s, i) => (
                      <div className="callbacks-source" key={i}>
                        <span className="callbacks-source__n">{s.n}</span>
                        <span className="callbacks-source__v">{s.v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="callbacks-placeholder">
                    <span className="callbacks-placeholder__title">Pick somebody on the left</span>
                    <span className="callbacks-placeholder__line">
                      Every task keeps the call it came from, so you can hear what was promised before you ring.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {toast && <div className="ops-toast">{toast}</div>}
        </>
      )}
    </WorkspaceShell>
  );
}
