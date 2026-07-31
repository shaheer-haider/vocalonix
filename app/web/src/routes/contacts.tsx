import "./contacts.css";

import { useEffect, useMemo, useRef, useState } from "react";

import { Alert, Box, Button, EmptyState, Pill, TextArea } from "../components/ui";
import { BookIcon, PhoneIcon } from "../icons";
import { WorkspaceShell } from "./business";

type Filter = "all" | "confirm" | "unnamed" | "booked" | "flagged";
type Source = "agent" | "visitor" | "sync" | null;
type Tag = "upcoming" | "done" | "missed";

interface TimelineEntry {
  kind: "call" | "book";
  when: string;
  title: string;
  body: string;
  len?: string;
  tag?: Tag;
  flag?: boolean;
}

interface NextAppointment {
  when: string;
  what: string;
}

interface Person {
  id: string;
  name: string;
  src: Source;
  confirm?: boolean;
  when: string;
  sub: string;
  phone?: string;
  email?: string;
  web?: string;
  visits: number;
  noShows: number;
  spend: string;
  since: string;
  next: NextAppointment | null;
  tags: string[];
  merge?: string | null;
  note: string;
  prov: string;
  tl: TimelineEntry[];
  unnamed?: boolean;
  flag?: boolean;
}

const PEOPLE: Person[] = [
  {
    id: "k1",
    name: "Marcus Bell",
    src: "agent",
    confirm: true,
    when: "21:14",
    sub: "Cracked filling \u2014 booked Saturday",
    phone: "+44 7700 900 482",
    email: "m.bell@\u200bmailbox.com",
    web: "Website visitor \u00b7 3 sessions",
    visits: 2,
    noShows: 0,
    spend: "\u00a3230",
    since: "Mar 2025",
    next: { when: "Sat 9:20am", what: "Emergency appointment \u00b7 Dr. Reyes \u00b7 20 min" },
    tags: ["Denplan"],
    merge: "A website visitor from 20:02 gave the same email. Same person?",
    note: "Nervous patient \u2014 prefers morning slots and a bit of warning about needles.",
    prov: "Name heard on a call, 28 Jul 21:15",
    tl: [
      { kind: "call", when: "21:14", title: "Cracked filling, wanted Saturday", body: "Booked the emergency slot and learned his name mid-call.", len: "1:48" },
      { kind: "call", when: "12 Apr", title: "Asked about whitening prices", body: "Answered, no booking taken.", len: "0:52" },
      { kind: "book", when: "Sat", title: "Emergency appointment", body: "9:20am \u00b7 Dr. Reyes \u00b7 20 min", tag: "upcoming" },
      { kind: "book", when: "19 Mar", title: "Check-up and clean", body: "\u00a3145 \u00b7 Dr. Reyes", tag: "done" },
    ],
  },
  {
    id: "k2",
    name: "Priya Raman",
    src: "sync",
    when: "19:47",
    sub: "Rebooked hygiene \u2014 Friday 4:30",
    phone: "+44 113 496 2210",
    email: "praman@\u200bwork.co.uk",
    web: "\u2014",
    visits: 9,
    noShows: 1,
    spend: "\u00a3840",
    since: "Jan 2023",
    next: { when: "Fri 4:30pm", what: "Hygiene \u00b7 Aleks \u00b7 30 min" },
    tags: ["Plan member", "Regular"],
    note: "Books hygiene every six months, always Friday afternoons.",
    prov: "Name from Dentrix \u00b7 canonical",
    tl: [
      { kind: "call", when: "19:47", title: "Rebooking a missed hygiene visit", body: "Apologised for the miss, the agent waived the fee under your rule.", len: "2:06" },
      { kind: "call", when: "12 Jan", title: "Moved her check-up a week later", body: "Rescheduled without needing anyone.", len: "0:44" },
      { kind: "book", when: "Fri", title: "Hygiene", body: "4:30pm \u00b7 Aleks \u00b7 30 min", tag: "upcoming" },
      { kind: "book", when: "14 Jul", title: "Hygiene", body: "11:00 \u00b7 Aleks \u00b7 did not arrive", tag: "missed" },
      { kind: "book", when: "12 Jan", title: "Check-up and clean", body: "\u00a3145 \u00b7 Dr. Reyes", tag: "done" },
    ],
  },
  {
    id: "k3",
    name: "Sarah (heard)",
    src: "agent",
    confirm: true,
    when: "17:55",
    sub: "Invisalign quote \u2014 callback promised",
    phone: "\u2014",
    email: "\u2014",
    web: "Website visitor \u00b7 1 session",
    visits: 0,
    noShows: 0,
    spend: "\u2014",
    since: "Today",
    next: null,
    tags: ["New"],
    note: "",
    prov: "Name heard on a call, spelling unconfirmed",
    tl: [
      { kind: "call", when: "17:55", title: "What does Invisalign cost?", body: "Over your quote limit \u2014 a callback was promised. Name heard, spelling unsure.", len: "3:12" },
    ],
  },
  {
    id: "k4",
    name: "+44 7900 812 004",
    src: null,
    when: "18:30",
    sub: "Unhappy about a crown \u2014 needs you",
    unnamed: true,
    phone: "+44 7900 812 004",
    email: "\u2014",
    web: "\u2014",
    visits: 1,
    noShows: 0,
    spend: "\u00a3620",
    since: "Jun 2026",
    next: null,
    tags: ["Complaint"],
    note: "",
    prov: "No name yet \u00b7 caller ID only",
    tl: [
      { kind: "call", when: "18:30", title: "Unhappy about a crown", body: "Handed over. The agent promised a call today \u2014 nobody has rung back.", len: "2:41", flag: true },
      { kind: "book", when: "19 Jun", title: "Crown fitted", body: "\u00a3620 \u00b7 Dr. Reyes", tag: "done" },
    ],
  },
  {
    id: "k5",
    name: "Tom Whitaker",
    src: "visitor",
    when: "11:08",
    sub: "Whitening \u2014 Thursday 6:30pm",
    phone: "+44 7822 664 120",
    email: "tomw@\u200bmail.com",
    web: "Website visitor \u00b7 2 sessions",
    visits: 3,
    noShows: 0,
    spend: "\u00a3465",
    since: "Sep 2024",
    next: { when: "Thu 6:30pm", what: "Whitening \u00b7 Dr. Osei \u00b7 45 min" },
    tags: ["Evenings only"],
    note: "Only ever books after work. Do not offer daytime slots.",
    prov: "Name given in the website widget",
    tl: [
      { kind: "call", when: "11:08", title: "Whitening, wanted a Thursday evening", body: "Gave his name in the widget, so the agent greeted him by it.", len: "1:29" },
      { kind: "book", when: "Thu", title: "Whitening", body: "6:30pm \u00b7 Dr. Osei \u00b7 \u00a3320 deposit paid", tag: "upcoming" },
      { kind: "book", when: "3 Feb", title: "Check-up", body: "\u00a3145 \u00b7 Dr. Osei", tag: "done" },
    ],
  },
  {
    id: "k6",
    name: "Website visitor",
    src: null,
    when: "20:02",
    sub: "Denplan and the price of a clean",
    unnamed: true,
    phone: "\u2014",
    email: "m.bell@\u200bmailbox.com",
    web: "Website visitor \u00b7 1 session",
    visits: 0,
    noShows: 0,
    spend: "\u2014",
    since: "Today",
    next: null,
    tags: [],
    merge: "Shares an email with Marcus Bell. Same person?",
    note: "",
    prov: "No name yet \u00b7 web session only",
    tl: [
      { kind: "call", when: "20:02", title: "Denplan and the price of a clean", body: "Answered, no booking taken.", len: "1:04" },
    ],
  },
  {
    id: "k7",
    name: "Ade Fashola",
    src: "sync",
    when: "2 days",
    sub: "Six-month check-up due",
    phone: "+44 7411 220 091",
    email: "\u2014",
    web: "\u2014",
    visits: 6,
    noShows: 0,
    spend: "\u00a3710",
    since: "Feb 2022",
    next: null,
    tags: ["Plan member"],
    note: "",
    prov: "Name from Dentrix \u00b7 canonical",
    tl: [
      { kind: "call", when: "2 days", title: "Running twenty minutes late", body: "Message passed to the front desk.", len: "0:38" },
      { kind: "book", when: "8 Feb", title: "Check-up", body: "\u00a3145 \u00b7 Dr. Reyes", tag: "done" },
    ],
  },
  {
    id: "k8",
    name: "Unknown caller",
    src: null,
    when: "16:20",
    sub: "Silence, hung up after 4 seconds",
    unnamed: true,
    flag: true,
    phone: "Withheld",
    email: "\u2014",
    web: "\u2014",
    visits: 0,
    noShows: 0,
    spend: "\u2014",
    since: "Today",
    next: null,
    tags: ["Blocked"],
    note: "Third silent call this week from a withheld number.",
    prov: "No caller ID",
    tl: [
      { kind: "call", when: "16:20", title: "Silence, hung up after 4 seconds", body: "Treated as spam. Not counted against your minutes.", len: "0:04", flag: true },
    ],
  },
];

function initials(p: Person): string {
  if (p.unnamed) return "?";
  const parts = p.name
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase());
  return parts.join("") || "?";
}

function sourceChip(src: Source) {
  switch (src) {
    case "agent":
      return { class: "contacts-source--warn", label: "HEARD ON A CALL" };
    case "visitor":
      return { class: "contacts-source--good", label: "GAVE THEIR NAME" };
    case "sync":
      return { class: "contacts-source--sync", label: "FROM DENTRIX" };
    default:
      return { class: "contacts-source--muted", label: "NO NAME YET" };
  }
}

function tagClass(tag: string): string {
  if (tag === "Blocked") return "contacts-tag--blocked";
  if (tag === "Complaint") return "contacts-tag--complaint";
  if (tag === "New") return "contacts-tag--new";
  return "contacts-tag--default";
}

function bookingPillVariant(tag?: Tag): Parameters<typeof Pill>[0]["variant"] {
  if (tag === "upcoming") return "good";
  if (tag === "missed") return "accent";
  return "default";
}

export function WorkspaceContactsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [dismissedMerges, setDismissedMerges] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<string | null>(null);
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});
  const [channelsMap, setChannelsMap] = useState<Record<string, string[]>>({});
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [addingChannel, setAddingChannel] = useState(false);
  const [channelDraft, setChannelDraft] = useState("");
  const [toast, setToast] = useState("");
  const toastRef = useRef<number | null>(null);

  const say = (msg: string) => {
    setToast(msg);
    if (toastRef.current) window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(""), 2400);
  };

  useEffect(() => {
    return () => {
      if (toastRef.current) window.clearTimeout(toastRef.current);
    };
  }, []);

  const pool = useMemo(
    () => PEOPLE.filter((p) => !deleted.includes(p.id)),
    [deleted],
  );

  const needsConfirm = (p: Person) => !!p.confirm && !confirmed.includes(p.id);
  const hasMerge = (p: Person) => !!p.merge && !dismissedMerges.includes(p.id);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.phone ?? ""} ${p.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "confirm") return needsConfirm(p);
      if (filter === "unnamed") return !!p.unnamed;
      if (filter === "booked") return !!p.next;
      if (filter === "flagged")
        return (
          p.tags.some((t) => t === "Blocked" || t === "Complaint") || !!p.flag
        );
      return true;
    });
  }, [pool, query, filter, confirmed, dismissedMerges]);

  const selected = PEOPLE.find((p) => p.id === selectedId);
  const selectedVisible =
    selected && list.some((p) => p.id === selected.id)
      ? selected
      : list[0] ?? null;

  const confirmCount = pool.filter(needsConfirm).length;
  const unnamedCount = pool.filter((p) => p.unnamed).length;

  const countLabel =
    list.length === pool.length
      ? `${pool.length} PEOPLE`
      : `${list.length} OF ${pool.length}`;

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "Everyone" },
    { key: "confirm", label: `Confirm ${confirmCount}` },
    { key: "unnamed", label: `No name ${unnamedCount}` },
    { key: "booked", label: "Booked in" },
    { key: "flagged", label: "Flagged" },
  ];

  const pendingConfirms = pool.filter(needsConfirm);
  const pendingMerges = pool.filter(hasMerge);

  function rowBadge(p: Person) {
    if (needsConfirm(p)) {
      return (
        <span className="contacts-row__badge contacts-row__badge--confirm">
          CONFIRM SPELLING
        </span>
      );
    }
    if (hasMerge(p)) {
      return (
        <span className="contacts-row__badge contacts-row__badge--merge">
          POSSIBLE DUPLICATE
        </span>
      );
    }
    if (p.next) {
      return (
        <span className="contacts-row__badge contacts-row__badge--booked">
          BOOKED {p.next.when.toUpperCase()}
        </span>
      );
    }
    if (p.tags.includes("Blocked")) {
      return (
        <span className="contacts-row__badge contacts-row__badge--blocked">
          BLOCKED
        </span>
      );
    }
    return null;
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setDraft(null);
    setAddingTag(false);
    setAddingChannel(false);
  }

  function renderList() {
    if (pool.length === 0) {
      return (
        <Box tone="default" style={{ padding: 0 }}>
          <div className="contacts-first-run">
            <EmptyState
              title="No names in here yet"
              icon={<span className="contacts-avatar contacts-avatar--large">?</span>}
              action={
                <div className="contacts-detail__actions">
                  <Button onClick={() => say("CSV import \u2014 next pass")}>Import a CSV</Button>
                  <Button
                    variant="default"
                    onClick={() => say("Add contact \u2014 next pass")}
                  >
                    Add someone by hand
                  </Button>
                </div>
              }
            >
              Robin adds a person the moment a caller gives a name or a number
              \u2014 you don&apos;t have to build this list. Bring your existing
              one over if you&apos;d rather not wait.
            </EmptyState>
            <div className="contacts-import">
              <div className="contacts-import__text">
                <span className="contacts-import__title">A CSV takes about a minute</span>
                <span className="contacts-import__blurb">
                  Two columns are enough: a name and a phone number. Robin then
                  greets returning patients by name instead of asking twice.
                </span>
              </div>
              <button
                className="contacts-link contacts-link--accent"
                onClick={() => say("Template downloaded")}
              >
                Download the template
              </button>
            </div>
          </div>
        </Box>
      );
    }

    return (
      <div className="contacts-list">
        <div className="contacts-list__header">
          <div className="contacts-list__title">
            <h2 className="contacts-list__heading">Contacts</h2>
            <span className="contacts-list__count">{countLabel}</span>
          </div>
          <div className="contacts-list__search">
            <svg width="14" height="14" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="14" cy="14" r="8.4" />
              <path d="M20.4 20.6l6 6" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, number or email"
            />
          </div>
          <div className="contacts-list__chips">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`contacts-chip ${filter === c.key ? "contacts-chip--active" : ""}`.trim()}
                onClick={() => setFilter(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {pendingConfirms.length > 0 && (
            <div className="contacts-prompt">
              <span className="contacts-prompt__text">
                The agent heard{" "}
                <strong>{pendingConfirms[0].name}</strong>
                {pendingConfirms.length > 1
                  ? ` and ${pendingConfirms.length - 1} more`
                  : null}
                {" "}but couldn&apos;t check it. Spelling is right?
              </span>
              <div className="contacts-prompt__actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirmed((s) => [...s, pendingConfirms[0].id]);
                    say("Name confirmed");
                  }}
                >
                  Spelling is right
                </Button>
                <Button
                  onClick={() => say("Rename \u2014 next pass")}
                >
                  Fix it
                </Button>
              </div>
            </div>
          )}

          {pendingMerges.map((p) => (
            <div className="contacts-merge" key={p.id}>
              <span className="contacts-merge__text">{p.merge}</span>
              <div className="contacts-merge__actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    setDismissedMerges((s) => [...s, p.id]);
                    say("Merged \u2014 history joined up");
                  }}
                >
                  Same person
                </Button>
                <Button
                  onClick={() => {
                    setDismissedMerges((s) => [...s, p.id]);
                    say("Kept separate");
                  }}
                >
                  Not them
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="contacts-list__scroll">
          {list.length === 0 ? (
            <EmptyState
              title="Nobody here"
              action={
                <Button onClick={() => { setQuery(""); setFilter("all"); }}>
                  Clear filters
                </Button>
              }
            >
              Nothing matches that. Try a number, or clear the filter.
            </EmptyState>
          ) : (
            <>
              {list.map((p) => {
                const active = selectedVisible?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`contacts-row ${active ? "contacts-row--active" : ""}`.trim()}
                    onClick={() => handleSelect(p.id)}
                  >
                    <span
                      className={`contacts-avatar contacts-avatar--small ${active ? "" : ""}`}
                    >
                      {initials(p)}
                    </span>
                    <span className="contacts-row__body">
                      <span className="contacts-row__line">
                        <span
                          className={`contacts-row__name ${p.unnamed ? "contacts-row__name--muted" : ""}`.trim()}
                        >
                          {p.name}
                        </span>
                        <span className="contacts-row__when">{p.when}</span>
                      </span>
                      <span className="contacts-row__sub">{p.sub}</span>
                      {rowBadge(p)}
                    </span>
                  </button>
                );
              })}
              <div className="contacts-import">
                <div className="contacts-import__text">
                  <span className="contacts-import__title">A CSV takes about a minute</span>
                  <span className="contacts-import__blurb">
                    Two columns are enough: a name and a phone number. Robin then
                    greets returning patients by name instead of asking twice.
                  </span>
                </div>
                <button
                  className="contacts-link contacts-link--accent"
                  onClick={() => say("Template downloaded")}
                >
                  Download the template
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderDetail() {
    if (!selectedVisible) {
      return (
        <div className="contacts-detail contacts-detail__empty">
          <EmptyState title="Pick somebody">
            Every number that has ever rung you is in this list, named or not.
          </EmptyState>
        </div>
      );
    }

    const p = selectedVisible;
    const src = sourceChip(p.src);
    const noteValue =
      draft !== null && selectedId === p.id
        ? draft
        : notes[p.id] !== undefined
          ? notes[p.id]
          : p.note;

    const calls = p.tl.filter((e) => e.kind === "call");
    const bookings = p.tl.filter((e) => e.kind === "book");

    const channels = [
      { kind: "phone", value: p.phone },
      { kind: "email", value: p.email },
      { kind: "web", value: p.web },
      ...(channelsMap[p.id] ?? []).map((v) => ({ kind: "other", value: v })),
    ].filter((c) => c.value && c.value !== "\u2014");

    const tags = p.tags.concat(tagsMap[p.id] ?? []);

    return (
      <div className="contacts-detail">
        <div className="contacts-detail__header">
          <div className="contacts-detail__head">
            <div className="contacts-detail__person">
              <span className="contacts-avatar contacts-avatar--large">
                {initials(p)}
              </span>
              <div>
                <div className="contacts-detail__title">
                  <h2 className="contacts-detail__name">{p.name}</h2>
                  <span className={`contacts-source ${src.class}`}>
                    {src.label}
                  </span>
                </div>
                <p className="contacts-detail__summary">
                  {p.visits} {p.visits === 1 ? "visit" : "visits"} \u00b7 known
                  since {p.since} \u00b7 last heard from {p.when}
                </p>
              </div>
            </div>
            <div className="contacts-detail__actions">
              <Button
                variant="primary"
                onClick={() => say("Dialling\u2026")}
              >
                <PhoneIcon size={16} /> Call
              </Button>
              <Button onClick={() => say("Booking flow \u2014 next pass")}>
                <BookIcon size={16} /> Book
              </Button>
              <Button onClick={() => say("Edit contact \u2014 next pass")}>
                Edit
              </Button>
            </div>
          </div>

          {needsConfirm(p) && (
            <div className="contacts-prompt">
              <span className="contacts-prompt__text">
                The agent heard this name but couldn&apos;t check it. Keep it as
                &ldquo;{p.name}&rdquo;?
              </span>
              <div className="contacts-prompt__actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirmed((s) => [...s, p.id]);
                    say("Name confirmed");
                  }}
                >
                  Spelling is right
                </Button>
                <Button onClick={() => say("Rename \u2014 next pass")}>
                  Fix it
                </Button>
              </div>
            </div>
          )}

          {hasMerge(p) && (
            <div className="contacts-merge">
              <span className="contacts-merge__text">{p.merge}</span>
              <div className="contacts-merge__actions">
                <Button
                  variant="primary"
                  onClick={() => {
                    setDismissedMerges((s) => [...s, p.id]);
                    say("Merged \u2014 history joined up");
                  }}
                >
                  Same person
                </Button>
                <Button
                  onClick={() => {
                    setDismissedMerges((s) => [...s, p.id]);
                    say("Kept separate");
                  }}
                >
                  Not them
                </Button>
              </div>
            </div>
          )}

          <div className="contacts-detail__stats">
            {[
              { k: "visits", v: String(p.visits) },
              { k: "no-shows", v: String(p.noShows) },
              { k: "spent", v: p.spend },
              { k: "first seen", v: p.since },
            ].map((s) => (
              <div className="contacts-stat" key={s.k}>
                <span className="contacts-stat__value">{s.v}</span>
                <span className="contacts-stat__label">{s.k}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="contacts-detail__main">
          <div className="contacts-detail__body">
            {p.next && (
              <div className="contacts-next">
                <div className="contacts-next__text">
                  <span className="contacts-next__label">Next appointment</span>
                  <span className="contacts-next__when">{p.next.when}</span>
                  <span className="contacts-next__what">{p.next.what}</span>
                </div>
                <div className="contacts-detail__actions">
                  <Button onClick={() => say("Reschedule \u2014 next pass")}>
                    Move
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => say("Cancel \u2014 next pass")}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="contacts-section__head">
              <span className="contacts-section__label">Calls</span>
              <span className="contacts-section__count">
                {calls.length} {calls.length === 1 ? "call" : "calls"}
              </span>
            </div>
            <div className="contacts-card">
              {calls.length === 0 ? (
                <span className="contacts-timeline__empty">No calls yet.</span>
              ) : (
                calls.map((c, i) => (
                  <a
                    key={i}
                    className="contacts-timeline__row"
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      say("Opens the conversation");
                    }}
                  >
                    <span
                      className={`contacts-timeline__dot ${c.flag ? "contacts-timeline__dot--accent" : ""}`}
                    />
                    <span className="contacts-timeline__when">{c.when}</span>
                    <span className="contacts-timeline__body">
                      <span className="contacts-timeline__title">{c.title}</span>
                      <span className="contacts-timeline__sub">{c.body}</span>
                    </span>
                    {c.len ? (
                      <span className="contacts-timeline__len">{c.len}</span>
                    ) : null}
                    <span className="contacts-timeline__arrow">\u2197</span>
                  </a>
                ))
              )}
            </div>

            <div className="contacts-section__head">
              <span className="contacts-section__label">Bookings</span>
              <span className="contacts-section__count">
                {bookings.length}{" "}
                {bookings.length === 1 ? "booking" : "bookings"}
              </span>
            </div>
            <div className="contacts-card">
              {bookings.length === 0 ? (
                <span className="contacts-timeline__empty">Never booked in.</span>
              ) : (
                bookings.map((b, i) => (
                  <div key={i} className="contacts-timeline__row">
                    <span
                      className={`contacts-timeline__dot ${
                        b.tag === "upcoming"
                          ? "contacts-timeline__dot--good"
                          : b.tag === "missed"
                            ? "contacts-timeline__dot--accent"
                            : ""
                      }`}
                    />
                    <span className="contacts-timeline__when">{b.when}</span>
                    <span className="contacts-timeline__body">
                      <span className="contacts-timeline__title">{b.title}</span>
                      <span className="contacts-timeline__sub">{b.body}</span>
                    </span>
                    {b.tag ? (
                      <span className="contacts-timeline__tag">
                        <Pill variant={bookingPillVariant(b.tag)}>
                          {b.tag === "upcoming"
                            ? "BOOKED"
                            : b.tag === "missed"
                              ? "MISSED"
                              : "DONE"}
                        </Pill>
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="contacts-detail__rail">
            <div className="contacts-rail__section">
              <span className="contacts-rail__label">Ways to reach them</span>
              {channels.map((c, i) => (
                <div className="contacts-channel" key={i}>
                  <span className="contacts-channel__kind">{c.kind}</span>
                  <span className="contacts-channel__value">{c.value}</span>
                </div>
              ))}
              {addingChannel ? (
                <input
                  autoFocus
                  className="contacts-tag-input"
                  value={channelDraft}
                  onChange={(e) => setChannelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && channelDraft.trim()) {
                      setChannelsMap((m) => ({
                        ...m,
                        [p.id]: [...(m[p.id] ?? []), channelDraft.trim()],
                      }));
                      setChannelDraft("");
                      setAddingChannel(false);
                      say("Channel added");
                    }
                    if (e.key === "Escape") setAddingChannel(false);
                  }}
                  onBlur={() => setAddingChannel(false)}
                  placeholder="Number or email"
                />
              ) : (
                <button
                  className="contacts-link contacts-link--accent"
                  onClick={() => setAddingChannel(true)}
                  style={{ alignSelf: "flex-start" }}
                >
                  + Add a number or email
                </button>
              )}
            </div>

            <div className="contacts-rail__section">
              <span className="contacts-rail__label">Tags</span>
              <div className="contacts-tags">
                {tags.map((t, i) => (
                  <span
                    key={i}
                    className={`contacts-tag ${tagClass(t)}`}
                  >
                    {t}
                  </span>
                ))}
                {addingTag ? (
                  <input
                    autoFocus
                    className="contacts-tag-input"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagDraft.trim()) {
                        setTagsMap((m) => ({
                          ...m,
                          [p.id]: [...(m[p.id] ?? []), tagDraft.trim()],
                        }));
                        setTagDraft("");
                        setAddingTag(false);
                        say("Tag added");
                      }
                      if (e.key === "Escape") setAddingTag(false);
                    }}
                    onBlur={() => setAddingTag(false)}
                    placeholder="New tag"
                  />
                ) : (
                  <button
                    type="button"
                    className="contacts-tag contacts-tag--add"
                    onClick={() => setAddingTag(true)}
                  >
                    + tag
                  </button>
                )}
              </div>
            </div>

            <div className="contacts-rail__section">
              <span className="contacts-rail__label">Note the agent can read</span>
              <TextArea
                value={noteValue}
                onChange={(e) => {
                  setDraft(e.target.value);
                }}
                placeholder="Anything it should know before it answers"
                style={{ minHeight: 96, fontSize: 16 }}
              />
              <Button
                onClick={() => {
                  setNotes((m) => ({ ...m, [p.id]: noteValue }));
                  setDraft(null);
                  say("Note saved \u2014 the agent will read it next time");
                }}
              >
                Save note
              </Button>
            </div>

            <div className="contacts-footer">
              <span className="contacts-provenance">{p.prov}</span>
              <div className="contacts-footer__actions">
                <button
                  className="contacts-link"
                  onClick={() => say("Contact exported as CSV")}
                >
                  Export
                </button>
                <button
                  className="contacts-link contacts-link--accent"
                  onClick={() => {
                    setDeleted((s) => [...s, p.id]);
                    if (selectedId === p.id) setSelectedId(null);
                    say("Delete needs a confirm step \u2014 next pass");
                  }}
                >
                  Delete contact
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceShell>
      {() => (
        <>
          <Alert variant="warn">
            Design preview \u2014 contacts show sample data while the contact
            backend is being built.
          </Alert>

          {pool.length === 0 ? (
            renderList()
          ) : (
            <div className="contacts-shell">
              {renderList()}
              {renderDetail()}
            </div>
          )}

          {toast ? <div className="contacts-toast">{toast}</div> : null}
        </>
      )}
    </WorkspaceShell>
  );
}
