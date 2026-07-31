import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Button,
  EmptyState,
  Modal,
  Pill,
  TextArea,
} from "../components/ui";
import { WaveIcon } from "../icons";
import { WorkspaceShell } from "./business";
import "./conversations.css";

interface IconProps {
  size?: number;
}

function SearchIcon({ size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="14" cy="14" r="8.4" />
      <path d="M20.4 20.6l6 6" />
    </svg>
  );
}

function PlayIcon({ size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function PauseIcon({ size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M8 5.5h3v13H8zM13 5.5h3v13h-3z" />
    </svg>
  );
}

function CheckIcon({ size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17.4c2 1.8 3.4 3.2 4.9 5.1 2.9-5.8 6.7-10.1 11.8-13.7" />
    </svg>
  );
}

type Turn = [number, "a" | "c", string];
type Fact = { k: string; v: string };
type ConversationStatus = "booked" | "answered" | "needs" | "spam" | "message";
type Filter = "all" | "needs" | "booked" | "none" | "spam";

interface Conversation {
  id: string;
  time: string;
  who: string;
  ch: string;
  summary: string;
  status: ConversationStatus;
  pill: string;
  value: string;
  dur: number;
  durLabel: string;
  when: string;
  did: Fact[];
  turns: Turn[];
}

const DATA: Conversation[] = [
  {
    id: "c1",
    time: "21:14",
    who: "+44 7700 900 482",
    ch: "came in on the website button",
    summary: "Cracked filling, wanted Saturday",
    status: "booked",
    pill: "BOOKED SAT 9:20",
    value: "\u00a3145",
    dur: 108,
    durLabel: "1:48",
    when: "Last night, 21:14",
    did: [
      { k: "Booked", v: "Sat 9:20am · Dr. Reyes" },
      { k: "Written to", v: "Dentrix · new patient" },
      { k: "Sent", v: "SMS confirmation" },
    ],
    turns: [
      [2, "a", "Thanks for calling Acme Dental, this is Robin. What can I help you with?"],
      [9, "c", "Hi — my filling cracked at dinner. Are you open Saturday?"],
      [14, "a", "Sorry to hear that. We keep two emergency slots on Saturday morning — I can hold 9:20 with Dr. Reyes. Any pain right now?"],
      [26, "c", "A bit sharp when I drink something cold."],
      [31, "a", "That\u2019s worth seeing but it isn\u2019t an emergency tonight. Avoid anything cold and I\u2019ll put you down for 9:20. Can I take your name?"],
      [44, "c", "Sam Whitfield. First time with you."],
      [49, "a", "Thanks Sam. Is this the best number to text the confirmation to?"],
      [57, "c", "Yes please."],
      [63, "a", "Done — Saturday 9:20 with Dr. Reyes. I\u2019ve noted the cracked filling so they\u2019ll allow extra time. Anything else?"],
      [78, "c", "No, that\u2019s great. Thank you."],
      [82, "a", "Take care, and see you Saturday."],
    ],
  },
  {
    id: "c2",
    time: "20:02",
    who: "Website visitor",
    ch: "started from the website button",
    summary: "Denplan and the price of a clean",
    status: "answered",
    pill: "ANSWERED · NO BOOKING",
    value: "",
    dur: 72,
    durLabel: "1:12",
    when: "Last night, 20:02",
    did: [
      { k: "Answered from", v: "Fees page · the brief" },
      { k: "Offered", v: "A hygiene slot" },
      { k: "Outcome", v: "Said they\u2019d think about it" },
    ],
    turns: [
      [3, "a", "Acme Dental, this is Robin. How can I help?"],
      [8, "c", "How much is a scale and polish, and do you take Denplan?"],
      [15, "a", "A hygiene visit is \u00a385, or it\u2019s included if you\u2019re on Denplan Essentials with us. Are you already a Denplan member somewhere?"],
      [29, "c", "I am, but with a practice in Sheffield."],
      [36, "a", "You can transfer the plan across — the team handles the paperwork. Would you like me to hold a hygiene appointment while you decide?"],
      [52, "c", "I\u2019ll have a think, thanks."],
      [58, "a", "No problem at all. Everything I\u2019ve quoted is on the fees page. Have a good evening."],
    ],
  },
  {
    id: "c3",
    time: "19:47",
    who: "+44 113 496 2210",
    ch: "rang the practice number",
    summary: "Rebooking a missed hygiene appointment",
    status: "booked",
    pill: "BOOKED FRI 16:30",
    value: "\u00a385",
    dur: 95,
    durLabel: "1:35",
    when: "Last night, 19:47",
    did: [
      { k: "Booked", v: "Fri 4:30pm · Hygienist" },
      { k: "Written to", v: "Dentrix · existing patient" },
      { k: "Waived", v: "Missed-visit fee" },
    ],
    turns: [
      [2, "a", "Acme Dental, Robin speaking."],
      [6, "c", "I missed my hygiene appointment this morning. Can I move it?"],
      [13, "a", "Of course. I have Friday at 4:30 or Tuesday at 11. Which suits?"],
      [24, "c", "Friday, please. Am I charged for missing it?"],
      [33, "a", "Not for a first miss — I\u2019ve waived it. You\u2019re down for Friday 4:30, and I\u2019ll text a reminder the day before."],
      [48, "c", "Perfect, thank you."],
    ],
  },
  {
    id: "c4",
    time: "18:30",
    who: "+44 7900 812 004",
    ch: "rang the practice number",
    summary: "Unhappy about a crown fitted last month",
    status: "needs",
    pill: "HANDED OVER · NOT CALLED BACK",
    value: "",
    dur: 143,
    durLabel: "2:23",
    when: "Last night, 18:30",
    did: [
      { k: "Took", v: "Name and number" },
      { k: "Promised", v: "A call back today" },
      { k: "Avoided", v: "Any refund talk" },
    ],
    turns: [
      [2, "a", "Acme Dental, this is Robin. How can I help?"],
      [7, "c", "You fitted me a crown four weeks ago and it\u2019s catching every time I bite. I\u2019ve had to take painkillers all week."],
      [21, "a", "I\u2019m sorry — that shouldn\u2019t be happening and it\u2019s not something you should be living with. Can I take your name so I can get the right person to look at it?"],
      [38, "c", "Dawn Harkness. I was with Dr. Odell."],
      [45, "a", "Thank you Dawn. I can\u2019t book an adjustment myself, but I\u2019ll pass this to the practice manager tonight and somebody will ring you tomorrow morning."],
      [63, "c", "Will I be charged again? Because I paid \u00a3620 for it."],
      [72, "a", "I\u2019m not able to answer anything about the cost — the practice manager will go through that with you directly."],
      [86, "c", "Fine. Please make sure someone actually calls."],
      [93, "a", "I\u2019ve flagged it as urgent. Sorry again for the trouble, Dawn."],
    ],
  },
  {
    id: "c5",
    time: "17:55",
    who: "Website visitor",
    ch: "started from the website button",
    summary: "Asked what Invisalign costs — over your quote limit",
    status: "needs",
    pill: "CALLBACK PROMISED",
    value: "\u00a34k?",
    dur: 84,
    durLabel: "1:24",
    when: "Last night, 17:55",
    did: [
      { k: "Quoted", v: "Nothing · above your limit" },
      { k: "Captured", v: "Email address" },
      { k: "Promised", v: "A price by phone today" },
    ],
    turns: [
      [3, "a", "Acme Dental, Robin here. What can I help with?"],
      [8, "c", "What does Invisalign cost with you?"],
      [14, "a", "Clear aligners start around \u00a32,400 and go up depending on how much movement is needed. I\u2019m not able to give you a firm figure without a consultation."],
      [30, "c", "Roughly, though? I\u2019ve been quoted four thousand elsewhere."],
      [40, "a", "I\u2019d rather not guess at that number. The consultation is \u00a350 and it comes off the treatment if you go ahead — can I take an email and have someone send you a proper breakdown?"],
      [61, "c", "d.mercer@… yes, that\u2019s fine."],
      [70, "a", "Got it. Somebody will be in touch tomorrow with a written quote."],
    ],
  },
  {
    id: "c6",
    time: "16:20",
    who: "Unknown caller",
    ch: "rang the practice number",
    summary: "Silence, then hung up after 4 seconds",
    status: "spam",
    pill: "IGNORED · NOT BILLED",
    value: "",
    dur: 4,
    durLabel: "0:04",
    when: "Yesterday, 16:20",
    did: [
      { k: "Treated as", v: "Silent call" },
      { k: "Billed", v: "No minutes used" },
      { k: "Blocked", v: "Not yet · first time" },
    ],
    turns: [],
  },
  {
    id: "c7",
    time: "15:03",
    who: "+44 7411 220 091",
    ch: "rang the practice number",
    summary: "Running twenty minutes late",
    status: "message",
    pill: "MESSAGE TAKEN",
    value: "",
    dur: 38,
    durLabel: "0:38",
    when: "Yesterday, 15:03",
    did: [
      { k: "Message to", v: "Front desk" },
      { k: "Appointment", v: "Held · 3:20pm" },
      { k: "Sent", v: "Nothing to the patient" },
    ],
    turns: [
      [2, "a", "Acme Dental, Robin speaking."],
      [5, "c", "I\u2019m stuck in traffic, I\u2019ll be about twenty minutes late for 3:20."],
      [12, "a", "Thanks for letting us know. I\u2019ll get that to the front desk now — they\u2019ll hold your slot if they can. What name is it under?"],
      [24, "c", "Priya Raman."],
      [28, "a", "Passed on. Drive safely, Priya."],
    ],
  },
  {
    id: "c8",
    time: "12:41",
    who: "Website visitor",
    ch: "started from the website button",
    summary: "Parking near the practice",
    status: "answered",
    pill: "ANSWERED · NO BOOKING",
    value: "",
    dur: 46,
    durLabel: "0:46",
    when: "Yesterday, 12:41",
    did: [
      { k: "Answered from", v: "Getting here · the brief" },
      { k: "Offered", v: "Nothing further" },
      { k: "Outcome", v: "Question answered" },
    ],
    turns: [
      [2, "a", "Acme Dental, this is Robin."],
      [5, "c", "Is there parking at the practice?"],
      [10, "a", "There are four spaces behind the building off Ashfield Lane, and the Queen Street multi-storey is a two-minute walk. Both are free on Saturdays."],
      [26, "c", "Great, thanks."],
    ],
  },
  {
    id: "c9",
    time: "11:08",
    who: "+44 7822 664 120",
    ch: "rang the practice number",
    summary: "Whitening, wanted a Thursday evening",
    status: "booked",
    pill: "BOOKED THU 18:30",
    value: "\u00a3320",
    dur: 132,
    durLabel: "2:12",
    when: "Yesterday, 11:08",
    did: [
      { k: "Booked", v: "Thu 6:30pm · Dr. Reyes" },
      { k: "Written to", v: "Dentrix · existing patient" },
      { k: "Sent", v: "SMS confirmation" },
    ],
    turns: [
      [3, "a", "Acme Dental, Robin speaking."],
      [7, "c", "Do you do whitening, and can I come after work?"],
      [14, "a", "We do — \u00a3320 for the take-home kit with two fittings. Thursdays we\u2019re open until eight. Would 6:30 this Thursday work?"],
      [31, "c", "That\u2019s perfect."],
      [35, "a", "Booked. I\u2019ll text you the details — nothing to pay until the first fitting."],
    ],
  },
  {
    id: "c10",
    time: "09:52",
    who: "+44 7300 118 842",
    ch: "rang the practice number",
    summary: "Do you see children on the NHS",
    status: "answered",
    pill: "ANSWERED · NO BOOKING",
    value: "",
    dur: 58,
    durLabel: "0:58",
    when: "Yesterday, 09:52",
    did: [
      { k: "Answered from", v: "NHS · the brief" },
      { k: "Offered", v: "To join the waiting list" },
      { k: "Outcome", v: "Will call back" },
    ],
    turns: [
      [2, "a", "Acme Dental, this is Robin."],
      [5, "c", "Are you taking on children on the NHS?"],
      [11, "a", "We do see under-18s on the NHS, but the list is closed at the moment. I can put you on the waiting list — it\u2019s about three months."],
      [27, "c", "I\u2019ll ask my husband and ring back."],
      [33, "a", "Of course. Ask for the NHS children\u2019s list when you do."],
    ],
  },
];

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function WorkspaceConversationsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [handled, setHandled] = useState<string[]>([]);
  const [corrected, setCorrected] = useState<Record<string, string>>({});
  const [fixOpen, setFixOpen] = useState(false);
  const [fixText, setFixText] = useState("");
  const [fixKind, setFixKind] = useState<"knowledge" | "rule" | "handover">("rule");
  const [fixLine, setFixLine] = useState(0);
  const [toast, setToast] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const toastRef = useRef<number | null>(null);

  function isNeeds(c: Conversation) {
    return c.status === "needs" && !handled.includes(c.id);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DATA.filter((c) => {
      if (filter === "needs" && !isNeeds(c)) return false;
      if (filter === "booked" && c.status !== "booked") return false;
      if (filter === "none" && (c.status === "booked" || c.status === "spam")) return false;
      if (filter === "spam" && c.status !== "spam") return false;
      if (!q) return true;
      const hay = `${c.who} ${c.summary} ${c.pill}`.toLowerCase();
      if (hay.includes(q)) return true;
      return c.turns.some((t) => t[2].toLowerCase().includes(q));
    });
  }, [query, filter, handled]);

  const needs = visible.filter(isNeeds);
  const rest = visible.filter((c) => !isNeeds(c));
  const needsTotal = useMemo(() => DATA.filter(isNeeds).length, [handled]);
  const bookedTotal = useMemo(() => DATA.filter((c) => c.status === "booked").length, []);
  const noneTotal = useMemo(() => DATA.filter((c) => c.status !== "booked" && c.status !== "spam").length, []);
  const spamTotal = useMemo(() => DATA.filter((c) => c.status === "spam").length, []);

  const selectedConversation = useMemo(() => {
    if (!selected) return null;
    return visible.find((c) => c.id === selected) ?? null;
  }, [selected, visible]);

  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
  }, [selected]);

  useEffect(() => {
    if (!playing || !selectedConversation) return;
    const dur = selectedConversation.dur;
    const iv = window.setInterval(() => {
      setCurrentTime((t) => {
        const next = t + 0.5;
        if (next >= dur) {
          setPlaying(false);
          return dur;
        }
        return next;
      });
    }, 500);
    return () => window.clearInterval(iv);
  }, [playing, selectedConversation]);

  function say(message: string) {
    if (toastRef.current) window.clearTimeout(toastRef.current);
    setToast(message);
    toastRef.current = window.setTimeout(() => setToast(""), 2600);
  }

  const stop = useCallback(() => setPlaying(false), []);

  const togglePlay = useCallback(() => {
    if (!selectedConversation) return;
    if (playing) {
      setPlaying(false);
    } else {
      if (currentTime >= selectedConversation.dur) setCurrentTime(0);
      setPlaying(true);
    }
  }, [playing, currentTime, selectedConversation]);

  const markHandled = useCallback(() => {
    if (!selectedConversation) return;
    setHandled((prev) =>
      prev.includes(selectedConversation.id) ? prev : [...prev, selectedConversation.id],
    );
    say("Marked as handled");
  }, [selectedConversation]);

  const openFix = useCallback(() => {
    if (!selectedConversation) return;
    const lines = selectedConversation.turns.filter((t) => t[1] === "a");
    setFixOpen(true);
    setFixText("");
    setFixKind("rule");
    setFixLine(lines.length ? lines.length - 1 : 0);
  }, [selectedConversation]);

  const saveFix = useCallback(() => {
    if (!selectedConversation) return;
    const text =
      fixText.trim() || "Answer this the way the practice would, not the way the script does.";
    const where =
      fixKind === "knowledge"
        ? "Added to knowledge"
        : fixKind === "rule"
          ? "Saved as a rule"
          : "Set to hand over";
    setCorrected((prev) => ({ ...prev, [selectedConversation.id]: text }));
    setFixOpen(false);
    say(`${where} · live on the next call`);
  }, [fixText, fixKind, selectedConversation]);

  const kindHint =
    fixKind === "knowledge"
      ? "Saved as a fact Robin can quote — it will show up in Knowledge."
      : fixKind === "rule"
        ? "Saved as an instruction that overrides how Robin answers this topic."
        : "Robin will stop answering this topic and take a message instead.";

  const kindLabel: Record<"knowledge" | "rule" | "handover", string> = {
    knowledge: "Add to knowledge",
    rule: "Change a rule",
    handover: "Always hand to a human",
  };

  function renderRow(c: Conversation) {
    const needsNow = isNeeds(c);
    const active = selected === c.id;
    const pillText = c.status === "needs" && handled.includes(c.id) ? "YOU CALLED THEM BACK" : c.pill;
    const pillVariant: "accent" | "good" | "warn" | "default" = needsNow
      ? "accent"
      : c.status === "booked"
        ? "good"
        : c.status === "message"
          ? "warn"
          : "default";

    return (
      <button
        key={c.id}
        type="button"
        className={`conversations-row ${needsNow ? "conversations-row--needs" : ""} ${active ? "conversations-row--selected" : ""}`.trim()}
        onClick={() => {
          setSelected(c.id);
          setMobileDetail(true);
        }}
      >
        <span className="conversations-row__top">
          <span className="conversations-row__who">{c.who}</span>
          <span className="conversations-row__time">{c.time}</span>
        </span>
        <span className="conversations-row__summary">{c.summary}</span>
        <span className="conversations-row__tags">
          <Pill variant={pillVariant}>{pillText}</Pill>
          {c.value ? <span className="conversations-row__value">{c.value}</span> : null}
          {needsNow ? <Pill variant="accent">Needs you</Pill> : null}
        </span>
      </button>
    );
  }

  const detailContent = (() => {
    if (!selectedConversation) {
      return (
        <div className="conversations-detail__placeholder">
          <EmptyState title="Pick a conversation">
            <span>The transcript and what Robin did will show here.</span>
          </EmptyState>
        </div>
      );
    }

    const needsNow = isNeeds(selectedConversation);
    const correction = corrected[selectedConversation.id];
    const agentLines = selectedConversation.turns.filter((t) => t[1] === "a").map((t) => t[2]);
    const pct = Math.min(
      100,
      Math.round((currentTime / selectedConversation.dur) * 100),
    );

    return (
      <>
        <div className="conversations-detail__header">
          <div className="conversations-detail__head">
            <div>
              <Button
                className="conversations-detail__back"
                variant="ghost"
                onClick={() => setMobileDetail(false)}
              >
                Back
              </Button>
              <h2>{selectedConversation.who}</h2>
              <p className="conversations-detail__meta">
                {selectedConversation.when} · {selectedConversation.durLabel} ·{" "}
                {selectedConversation.ch}
              </p>
            </div>
            <div className="conversations-detail__actions">
              <Button onClick={() => say(`Ringing ${selectedConversation.who}…`)}>
                Call back
              </Button>
              <Button onClick={() => say("Transcript link copied")}>Share</Button>
            </div>
          </div>

          <div className="conversations-playbar">
            <button
              type="button"
              className="conversations-playbar__play"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
            </button>
            <span className="conversations-playbar__time">{fmt(currentTime)}</span>
            <span className="conversations-playbar__track">
              <span>
                <span
                  className="conversations-playbar__fill"
                  style={{ width: `${pct}%` }}
                />
                <span
                  className="conversations-playbar__knob"
                  style={{ left: `${pct}%` }}
                />
              </span>
              <input
                type="range"
                min={0}
                max={selectedConversation.dur}
                value={currentTime}
                onChange={(e) => {
                  stop();
                  setCurrentTime(Number(e.target.value));
                }}
                className="conversations-playbar__input"
                aria-label="Seek"
              />
            </span>
            <span className="conversations-playbar__time">
              {selectedConversation.durLabel}
            </span>
          </div>
        </div>

        <div className="conversations-detail__body">
          <div
            className={`conversations-did ${needsNow ? "conversations-did--needs" : ""}`.trim()}
          >
            <div className="conversations-did__head">
              <span className="conversations-did__icon">
                <CheckIcon size={11} />
              </span>
              <span className="conversations-did__label">
                {needsNow ? "What it did — and what it left you" : "What it did"}
              </span>
            </div>
            <div className="conversations-did__facts">
              {selectedConversation.did.map((fact) => (
                <div key={fact.k} className="conversations-did__fact">
                  <span>{fact.k}</span>
                  <strong>{fact.v}</strong>
                </div>
              ))}
            </div>
          </div>

          {correction ? (
            <div className="conversations-correction">
              <span>Added to the brief</span>
              <p>{correction}</p>
            </div>
          ) : null}

          {selectedConversation.turns.length === 0 ? (
            <div className="conversations-silent">
              <strong>Nothing was said</strong>
              <span>Four seconds of line noise, then the caller hung up.</span>
            </div>
          ) : (
            <div className="conversations-turns">
              {selectedConversation.turns.map((turn, i) => {
                const agent = turn[1] === "a";
                const next = selectedConversation.turns[i + 1];
                const live =
                  playing && currentTime >= turn[0] && (!next || currentTime < next[0]);
                const future = currentTime > 0 && currentTime < turn[0];
                return (
                  <div
                    key={i}
                    className={`conversations-turn ${agent ? "conversations-turn--agent" : "conversations-turn--caller"}`.trim()}
                  >
                    {agent ? (
                      <>
                        <span
                          className={`conversations-turn__bubble ${live ? "conversations-turn__bubble--live" : ""} ${future ? "conversations-turn__bubble--future" : ""}`.trim()}
                          onClick={() => {
                            stop();
                            setCurrentTime(turn[0]);
                          }}
                        >
                          {turn[2]}
                        </span>
                        <span className="conversations-turn__time">{fmt(turn[0])}</span>
                      </>
                    ) : (
                      <>
                        <span className="conversations-turn__time">{fmt(turn[0])}</span>
                        <span
                          className={`conversations-turn__bubble ${live ? "conversations-turn__bubble--live" : ""} ${future ? "conversations-turn__bubble--future" : ""}`.trim()}
                          onClick={() => {
                            stop();
                            setCurrentTime(turn[0]);
                          }}
                        >
                          {turn[2]}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="conversations-detail__footer">
          <span>
            {correction
              ? "Fixed — Robin will answer this differently."
              : "Was this a good answer?"}
          </span>
          <div className="conversations-detail__footer-actions">
            {needsNow ? (
              <Button onClick={markHandled}>Mark as handled</Button>
            ) : null}
            <Button
              className="conversations-detail__good"
              onClick={() => say("Noted — Robin keeps answering this way")}
            >
              Yes, good answer
            </Button>
            <Button
              className="conversations-detail__fix"
              onClick={openFix}
            >
              Fix this in the brief
            </Button>
          </div>
        </div>

        <Modal open={fixOpen} onClose={() => setFixOpen(false)} titleId="fix-title">
          <div className="modal-header">
            <div>
              <p className="conversations-modal__eyebrow">Teach Robin</p>
              <h2 id="fix-title" className="conversations-modal__title">
                Fix this in the brief
              </h2>
            </div>
            <button
              type="button"
              className="conversations-modal__close"
              onClick={() => setFixOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="conversations-modal__section">
            <span>What Robin said</span>
            <div className="conversations-modal__lines">
              {agentLines.length === 0 ? (
                <p className="conversations-modal__hint">Nothing was said in this call.</p>
              ) : (
                agentLines.map((line, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`conversations-modal__line ${i === fixLine ? "conversations-modal__line--active" : ""}`.trim()}
                    onClick={() => setFixLine(i)}
                  >
                    {line}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="conversations-modal__section">
            <span>What it should say next time</span>
            <TextArea
              value={fixText}
              onChange={(e) => setFixText(e.target.value)}
              placeholder="Crowns fitted in the last 12 months are put right free of charge. Say that, apologise, and book them in with the dentist who fitted it."
            />
          </div>

          <div className="conversations-modal__section">
            <span>Where it goes</span>
            <div className="conversations-modal__kinds">
              {(["knowledge", "rule", "handover"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`conversations-kind-chip ${fixKind === k ? "conversations-kind-chip--active" : ""}`.trim()}
                  onClick={() => setFixKind(k)}
                >
                  {kindLabel[k]}
                </button>
              ))}
            </div>
            <span className="conversations-modal__hint">{kindHint}</span>
          </div>

          <div className="conversations-modal__footer">
            <span className="conversations-modal__hint">
              Takes effect on the next call.
            </span>
            <div className="conversations-detail__footer-actions">
              <Button variant="ghost" onClick={() => setFixOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={saveFix}>
                Save to the brief
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  })();

  const listEmpty = visible.length === 0;

  return (
    <WorkspaceShell>
      {() => (
        <>
          <Alert variant="warn">
            Design preview — conversations show sample data while the transcript
            backend is being built.
          </Alert>

          <div
            className={`conversations-shell ${selectedConversation && mobileDetail ? "conversations-shell--detail" : ""}`.trim()}
          >
            <div className="conversations-list">
              <div className="conversations-header">
                <div className="conversations-title">
                  <h2>Conversations</h2>
                  <span className="conversations-count">
                    {listEmpty ? "0 TODAY" : `${visible.length} TODAY`}
                  </span>
                </div>

                <div className="conversations-searchbar">
                  <SearchIcon size={14} />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search words said"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                <div className="conversations-filters">
                  <button
                    type="button"
                    className={`conversations-chip ${filter === "all" ? "conversations-chip--active" : ""}`.trim()}
                    onClick={() => setFilter("all")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`conversations-chip ${filter === "needs" ? "conversations-chip--active" : ""}`.trim()}
                    onClick={() => setFilter("needs")}
                  >
                    Needs you {needsTotal}
                  </button>
                  <button
                    type="button"
                    className={`conversations-chip ${filter === "booked" ? "conversations-chip--active" : ""}`.trim()}
                    onClick={() => setFilter("booked")}
                  >
                    Booked {bookedTotal}
                  </button>
                  <button
                    type="button"
                    className={`conversations-chip ${filter === "none" ? "conversations-chip--active" : ""}`.trim()}
                    onClick={() => setFilter("none")}
                  >
                    No booking {noneTotal}
                  </button>
                  <button
                    type="button"
                    className={`conversations-chip ${filter === "spam" ? "conversations-chip--active" : ""}`.trim()}
                    onClick={() => setFilter("spam")}
                  >
                    Spam {spamTotal}
                  </button>
                </div>
              </div>

              <div className="conversations-list__body">
                {listEmpty ? (
                  <div className="conversations-first-run">
                    <span className="conversations-first-run__icon">
                      <WaveIcon size={22} />
                    </span>
                    <h3>Robin is listening</h3>
                    <p>
                      {query
                        ? "No calls match this search yet. Try a shorter word, or reset the filters."
                        : "No calls yet. The first one that comes in on your number or the website button will land here, with the transcript and what it did about it."}
                    </p>
                    <div className="conversations-first-run__actions">
                      <Button
                        variant="primary"
                        onClick={() => say("Dialling the test number…")}
                      >
                        Make a test call
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setQuery("");
                          setFilter("all");
                        }}
                      >
                        Show everything
                      </Button>
                    </div>

                    <div className="conversations-checklist">
                      <div className="conversations-checklist__head">
                        <span>While you wait</span>
                        <small>2 of 4 done</small>
                      </div>
                      <div className="conversations-checklist__item">
                        <span className="conversations-checklist__dot">
                          <CheckIcon size={11} />
                        </span>
                        <span>Calls forwarded from 0113 496 2288</span>
                      </div>
                      <div className="conversations-checklist__item">
                        <span className="conversations-checklist__dot">
                          <CheckIcon size={11} />
                        </span>
                        <span>Website button switched on</span>
                      </div>
                      <div className="conversations-checklist__item">
                        <span className="conversations-checklist__dot conversations-checklist__dot--todo" />
                        <span>Set opening hours</span>
                      </div>
                      <div className="conversations-checklist__item">
                        <span className="conversations-checklist__dot conversations-checklist__dot--todo" />
                        <span>Upload knowledge</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {needs.length > 0 ? (
                      <>
                        <div className="conversations-group">Needs you</div>
                        {needs.map(renderRow)}
                      </>
                    ) : null}
                    {rest.length > 0 ? (
                      <>
                        <div className="conversations-group">
                          {needs.length > 0 ? "Everything else" : "Yesterday evening"}
                        </div>
                        {rest.map(renderRow)}
                      </>
                    ) : null}
                  </>
                )}
              </div>

              <div className="conversations-footer">
                <span className="conversations-footer__label">
                  {listEmpty
                    ? "Nothing to export yet"
                    : `Showing ${visible.length} of ${DATA.length}`}
                </span>
                <Button
                  disabled={listEmpty}
                  onClick={() =>
                    listEmpty
                      ? say("Nothing to export yet")
                      : say(`Exported ${visible.length} conversations to CSV`)
                  }
                >
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="conversations-detail">{detailContent}</div>
          </div>

          {toast ? (
            <div className="conversations-toast" role="status">
              {toast}
            </div>
          ) : null}
        </>
      )}
    </WorkspaceShell>
  );
}
