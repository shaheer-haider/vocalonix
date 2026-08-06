import { useEffect, useMemo, useState } from "react";

import { api, type CallbackTask, type CallbacksResponse } from "../api";
import { Alert, Box, Button, TextArea, TextField } from "../components/ui";
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

const SRC: Record<CallbackTask["source"], { text: string; cls: string }> = {
  call: { text: "FROM A CALL", cls: "callbacks-tag--call" },
  manual: { text: "ADDED BY HAND", cls: "callbacks-tag--hand" },
};

const GROUPS: [string, string, string][] = [
  ["late", "Late — already promised", "var(--accent)"],
  ["soon", "Within the hour", "var(--warn)"],
  ["today", "Later today", "var(--ink-4)"],
  ["ahead", "Tomorrow and after", "var(--ink-4)"],
  ["closed", "Closed", "var(--good)"],
];

type CallbackBucket = "late" | "soon" | "today" | "ahead" | "closed";

interface CallbackRow extends CallbackTask {
  closed: boolean;
  diffMinutes: number;
  bucket: CallbackBucket;
}

function whenLabel(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return time;
  return `${date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

function relLabel(row: CallbackRow): string {
  if (row.status === "spoke") return `done ${row.closedAt ? whenLabel(row.closedAt) : ""}`.trim();
  if (row.status === "voicemail") return "message left";
  if (row.status === "dropped") return "dropped";
  const diff = row.diffMinutes;
  if (diff < 0) return `${span(diff)} late`;
  if (diff >= 1440) return `in ${Math.round(diff / 1440)} day${diff >= 2880 ? "s" : ""}`;
  return `in ${span(diff)}`;
}

function toRow(task: CallbackTask, now: number): CallbackRow {
  const closed = task.status !== "open";
  const diffMinutes = Math.round((Date.parse(task.promisedAt) - now) / 60000);
  const sameDay = new Date(task.promisedAt).toDateString() === new Date(now).toDateString();
  let bucket: CallbackBucket = "today";
  if (closed) bucket = "closed";
  else if (diffMinutes < 0) bucket = "late";
  else if (diffMinutes <= 60) bucket = "soon";
  else if (!sameDay) bucket = "ahead";
  return { ...task, closed, diffMinutes, bucket };
}

const DUE_OPTIONS = [
  { key: "30", label: "In 30 min", minutes: 30 },
  { key: "2h", label: "In 2 hours", minutes: 120 },
  { key: "tom", label: "Tomorrow 9am", minutes: -1 },
];

function dueOptionDate(minutes: number): Date {
  if (minutes === -1) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return new Date(Date.now() + minutes * 60000);
}

function CallbacksPage({ slug }: { slug: string }) {
  const [data, setData] = useState<CallbacksResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "unassigned" | "overdue">("all");
  const [showDone, setShowDone] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ contactName: "", contactChannel: "", reason: "", due: "30", assignedTo: "" });

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api.businesses
      .callbacks(slug)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoadError(caught instanceof Error ? caught.message : "Unable to load callbacks.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  };

  const now = Date.now();
  const allRows = useMemo(
    () => (data?.callbacks ?? []).map((task) => toRow(task, now)),
    [data, now],
  );

  const open = allRows.filter((r) => !r.closed);
  const late = open.filter((r) => r.diffMinutes < 0);
  const un = open.filter((r) => !r.assignedTo);
  const closedRows = allRows.filter((r) => r.closed && r.status !== "dropped");

  const filtered = useMemo(() => {
    let list = allRows;
    if (filter === "mine") list = list.filter((r) => r.assignedTo === data?.viewerId);
    else if (filter === "unassigned") list = list.filter((r) => !r.assignedTo && !r.closed);
    else if (filter === "overdue") list = list.filter((r) => !r.closed && r.diffMinutes < 0);
    if (!showDone) list = list.filter((r) => !r.closed);
    return list;
  }, [allRows, filter, showDone, data]);

  const groups = GROUPS.map(([key, label, color]) => {
    const items = filtered
      .filter((r) => r.bucket === key)
      .sort((a, b) => Date.parse(a.promisedAt) - Date.parse(b.promisedAt));
    if (!items.length) return null;
    return { key, label, color, count: `${items.length} ${key === "closed" ? "done" : "waiting"}`, items };
  }).filter((g): g is NonNullable<typeof g> => g !== null);

  const selected = allRows.find((r) => r.id === sel);
  const canManage = data?.canManage ?? false;

  const applyUpdate = (updated: CallbackTask) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            callbacks: prev.callbacks.map((c) => (c.id === updated.id ? updated : c)),
          }
        : prev,
    );
  };

  const update = async (id: string, changes: Parameters<typeof api.businesses.updateCallback>[2], message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.businesses.updateCallback(slug, id, changes);
      applyUpdate(result.callback);
      say(message);
    } catch (caught: unknown) {
      say(caught instanceof Error ? caught.message : "That change did not save.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (busy) return;
    if (!form.contactName.trim() || !form.contactChannel.trim() || !form.reason.trim()) {
      say("Name, number and reason are all needed");
      return;
    }
    setBusy(true);
    try {
      const option = DUE_OPTIONS.find((d) => d.key === form.due) ?? DUE_OPTIONS[0];
      const result = await api.businesses.createCallback(slug, {
        contactName: form.contactName.trim(),
        contactChannel: form.contactChannel.trim(),
        reason: form.reason.trim(),
        promisedAt: dueOptionDate(option.minutes).toISOString(),
        assignedTo: form.assignedTo || null,
      });
      setData((prev) =>
        prev ? { ...prev, callbacks: prev.callbacks.concat([result.callback]) } : prev,
      );
      setForm({ contactName: "", contactChannel: "", reason: "", due: "30", assignedTo: "" });
      setShowNew(false);
      setSel(result.callback.id);
      say(`${result.callback.contactName} is in the queue`);
    } catch (caught: unknown) {
      say(caught instanceof Error ? caught.message : "Could not create the callback.");
    } finally {
      setBusy(false);
    }
  };

  const handleNoAnswer = () => {
    if (!selected) return;
    const nextDue = new Date(Date.now() + 45 * 60000);
    void update(
      selected.id,
      {
        attemptNote: `${selected.assigneeName ?? "Somebody"} rang — no answer`,
        promisedAt: nextDue.toISOString(),
      },
      `No answer — back in the queue for ${whenLabel(nextDue.toISOString())}`,
    );
  };

  const load = (data?.members ?? [])
    .map((p) => {
      const mine = open.filter((r) => r.assignedTo === p.userId);
      return {
        key: p.userId,
        label: p.name,
        sub: p.role,
        mine,
        l: mine.filter((r) => r.diffMinutes < 0).length,
        next: [...mine].sort((a, b) => Date.parse(a.promisedAt) - Date.parse(b.promisedAt))[0],
        count: mine.length ? String(mine.length) : "—",
      };
    })
    .concat([
      {
        key: "",
        label: "Nobody yet",
        sub: "",
        mine: un,
        l: un.filter((r) => r.diffMinutes < 0).length,
        next: [...un].sort((a, b) => Date.parse(a.promisedAt) - Date.parse(b.promisedAt))[0],
        count: un.length ? String(un.length) : "—",
      },
    ]);

  const maxLoad = Math.max(1, ...load.map((m) => m.mine.length));
  const fillColors = ["var(--accent-ink)", "var(--accent)", "var(--warn)", "var(--good)", "var(--accent-soft)"];

  const emptyTitle =
    filter === "overdue"
      ? "Nothing is late"
      : filter === "unassigned"
        ? "Everything has an owner"
        : allRows.length === 0
          ? "No callbacks yet"
          : "Nothing here";
  const emptyLine =
    filter === "overdue"
      ? "Every promise still has time left on it."
      : filter === "unassigned"
        ? "Every open callback has somebody's name on it."
        : allRows.length === 0
          ? "Add one by hand, or they will appear here when calls need a follow-up."
          : "No callback matches that filter right now.";

  if (loadError) {
    return <Alert variant="warn">{loadError}</Alert>;
  }

  return (
    <>
      <div className="ops-page">
        <div className="ops-main">
          <div className="ops-header">
            <div className="ops-header__row" style={{ alignItems: "flex-end" }}>
              <div>
                <h1 className="ops-title">Callbacks</h1>
                <p className="ops-blurb">One queue for every promise to ring somebody back.</p>
              </div>
              {canManage && (
                <div className="ops-toolbar">
                  <Button variant="primary" onClick={() => setShowNew((v) => !v)}>
                    {showNew ? "Close the form" : "New callback"}
                  </Button>
                </div>
              )}
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
                  <span className="ops-stat__k">nobody's</span>
                </div>
                <div className="ops-stat">
                  <span className="ops-stat__v ops-stat__v--good">{closedRows.length}</span>
                  <span className="ops-stat__k">closed</span>
                </div>
              </div>

              <div className="ops-toolbar">
                {(["all", "mine", "unassigned", "overdue"] as const).map((f) => (
                  <button
                    type="button"
                    key={f}
                    className={`ops-chip ${filter === f ? "ops-chip--active" : ""}`}
                    onClick={() => {
                      setFilter(f);
                      setSel(null);
                    }}
                  >
                    {f === "all" ? "Everything" : f === "mine" ? "Mine" : f === "unassigned" ? "Nobody's" : "Late"}
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

            {late.length > 0 && (
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
            {!data ? (
              <div className="callbacks-empty">
                <span className="callbacks-empty__title">Loading the queue…</span>
              </div>
            ) : groups.length > 0 ? (
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
                    const src = SRC[r.source];
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
                            {whenLabel(r.promisedAt)}
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
                            <span className={["callbacks-name", r.closed ? "callbacks-name--closed" : ""].join(" ")}>{r.contactName}</span>
                            <span className={["callbacks-tag", src.cls].join(" ")}>{src.text}</span>
                          </span>
                          <span className="callbacks-why">{r.reason}</span>
                        </span>
                        <span className="callbacks-right">
                          {r.attempts.length > 0 && !r.closed && (
                            <span className="callbacks-attempts-tag">
                              {r.attempts.length} {r.attempts.length === 1 ? "TRY" : "TRIES"}
                            </span>
                          )}
                          <span
                            className={[
                              "callbacks-owner",
                              r.assignedTo ? "callbacks-owner--set" : "callbacks-owner--none",
                            ].join(" ")}
                          >
                            {r.assigneeName || "nobody"}
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
                {allRows.length > 0 && (
                  <Button variant="default" onClick={() => setFilter("all")}>
                    Show everything
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="callbacks-rail">
          {showNew && canManage ? (
            <div className="callbacks-detail">
              <div className="callbacks-detail__head">
                <span className="callbacks-section__label">New callback</span>
                <button type="button" className="callbacks-detail__close" onClick={() => setShowNew(false)}>
                  CLOSE ✕
                </button>
              </div>
              <TextField
                label="Who to ring"
                value={form.contactName}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder="Their name"
              />
              <TextField
                label="Number or email"
                value={form.contactChannel}
                maxLength={160}
                onChange={(e) => setForm((f) => ({ ...f, contactChannel: e.target.value }))}
                placeholder="+1 555 010 0000"
              />
              <TextArea
                label="What it is about"
                rows={3}
                value={form.reason}
                maxLength={1000}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="What was promised, or what they need"
              />
              <div className="callbacks-section">
                <span className="callbacks-section__label">Due back</span>
                <div className="callbacks-chip-row">
                  {DUE_OPTIONS.map((d) => (
                    <button
                      type="button"
                      key={d.key}
                      className={`ops-chip ${form.due === d.key ? "ops-chip--active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, due: d.key }))}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="callbacks-section">
                <span className="callbacks-section__label">Whose job it is</span>
                <div className="callbacks-chip-row">
                  {[{ userId: "", name: "Nobody", role: "" }].concat(data?.members ?? []).map((p) => (
                    <button
                      type="button"
                      key={p.userId || "none"}
                      className={`ops-chip ${form.assignedTo === p.userId ? "ops-chip--active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, assignedTo: p.userId }))}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="primary" disabled={busy} onClick={() => void handleCreate()}>
                Put it in the queue
              </Button>
            </div>
          ) : selected ? (
            <div className="callbacks-detail">
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="callbacks-detail__head">
                  <span className={["callbacks-detail__tag", SRC[selected.source].cls].join(" ")}>
                    {SRC[selected.source].text}
                  </span>
                  <button type="button" className="callbacks-detail__close" onClick={() => setSel(null)}>
                    CLOSE ✕
                  </button>
                </div>
                <span className="callbacks-detail__who">{selected.contactName}</span>
                <span className="callbacks-detail__channel">{selected.contactChannel}</span>
                <span className="callbacks-detail__why">{selected.reason}</span>
              </div>

              <div className="callbacks-facts">
                {[
                  { k: "added", v: whenLabel(selected.createdAt) },
                  { k: "due back", v: `${whenLabel(selected.promisedAt)} · ${relLabel(selected)}` },
                ].map((f) => (
                  <div className="callbacks-fact" key={f.k}>
                    <span className="callbacks-fact__k">{f.k}</span>
                    <span className="callbacks-fact__v">{f.v}</span>
                  </div>
                ))}
                {selected.runId !== null && (
                  <div className="callbacks-links">
                    <a href={`/app/${slug}/conversations`}>The call ↗</a>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="callbacks-section">
                  <span className="callbacks-section__label">Whose job it is</span>
                  <div className="callbacks-chip-row">
                    {[{ userId: "", name: "Nobody", role: "" }].concat(data?.members ?? []).map((p) => (
                      <button
                        type="button"
                        key={p.userId || "none"}
                        className={`ops-chip ${(selected.assignedTo ?? "") === p.userId ? "ops-chip--active" : ""}`}
                        disabled={busy}
                        onClick={() =>
                          void update(
                            selected.id,
                            { assignedTo: p.userId || null },
                            p.userId ? `${p.name} has it now` : "Back in the shared pile",
                          )
                        }
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {canManage && !selected.closed && (
                <div className="callbacks-section">
                  <span className="callbacks-section__label">Due back</span>
                  <div className="callbacks-chip-row">
                    {DUE_OPTIONS.map((d) => (
                      <button
                        type="button"
                        key={d.key}
                        className="ops-chip"
                        disabled={busy}
                        onClick={() => {
                          const at = dueOptionDate(d.minutes);
                          void update(
                            selected.id,
                            { promisedAt: at.toISOString() },
                            `Due ${whenLabel(at.toISOString())}`,
                          );
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="callbacks-attempts">
                <span className="callbacks-section__label">Attempts</span>
                {selected.attempts.length > 0 ? (
                  selected.attempts.map((a, i) => (
                    <div className="callbacks-attempt" key={i}>
                      <span className="callbacks-attempt__t">{whenLabel(a.at)}</span>
                      <span className="callbacks-attempt__v">{a.note}</span>
                    </div>
                  ))
                ) : (
                  <span className="callbacks-note">Nobody has tried yet.</span>
                )}
              </div>

              {canManage &&
                (!selected.closed ? (
                  <div className="callbacks-actions">
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        void update(
                          selected.id,
                          { status: "spoke" },
                          `${selected.contactName} — done`,
                        )
                      }
                    >
                      Spoke to them — done
                    </Button>
                    <div className="callbacks-outcomes">
                      <Button variant="default" disabled={busy} onClick={handleNoAnswer}>
                        No answer
                      </Button>
                      <Button
                        variant="default"
                        disabled={busy}
                        onClick={() =>
                          void update(
                            selected.id,
                            { status: "voicemail", attemptNote: "Left a voicemail" },
                            "Message left",
                          )
                        }
                      >
                        Left a message
                      </Button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void update(
                          selected.id,
                          { status: "dropped" },
                          "Dropped — taken off the queue",
                        )
                      }
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
                      {selected.status === "spoke"
                        ? `Spoke to them${selected.closedAt ? ` at ${whenLabel(selected.closedAt)}` : ""}. The promise is cleared.`
                        : selected.status === "voicemail"
                          ? `Message left${selected.closedAt ? ` at ${whenLabel(selected.closedAt)}` : ""}.`
                          : "Dropped — nobody is expecting a call."}
                    </span>
                    <button
                      type="button"
                      className="callbacks-reopen"
                      disabled={busy}
                      onClick={() =>
                        void update(
                          selected.id,
                          { status: "open" },
                          `${selected.contactName} is back in the queue`,
                        )
                      }
                    >
                      Put it back in the queue
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <div className="callbacks-summary">
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <span className="callbacks-section__label">Who is carrying what</span>
                {load.map((m, i) => (
                  <div className="callbacks-load__item" key={m.key || "none"}>
                    <div className="callbacks-load__head">
                      <span className="callbacks-load__name">{`${m.label}${m.sub ? ` · ${m.sub}` : ""}`}</span>
                      <span
                        className={[
                          "callbacks-load__count",
                          m.l ? "callbacks-load__count--late" : "",
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
                        : m.next
                          ? `${m.l ? `${m.l} late · ` : ""}next ${whenLabel(m.next.promisedAt)} · ${m.next.contactName}`
                          : ""}
                    </span>
                  </div>
                ))}
              </div>

              <div className="callbacks-placeholder">
                <span className="callbacks-placeholder__title">Pick somebody on the left</span>
                <span className="callbacks-placeholder__line">
                  Every task keeps who asked, what was promised, and every attempt made.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="ops-toast">{toast}</div>}
    </>
  );
}

export function WorkspaceCallbacksPage() {
  return (
    <WorkspaceShell>{(business) => <CallbacksPage slug={business.slug} />}</WorkspaceShell>
  );
}
