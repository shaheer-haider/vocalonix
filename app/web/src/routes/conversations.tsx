import { useEffect, useMemo, useState } from "react";

import {
  api,
  type ConversationDetail,
  type ConversationSummary,
} from "../api";
import { Alert, Button, EmptyState, Pill } from "../components/ui";
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

interface TranscriptTurn {
  offsetSeconds: number | null;
  role: "agent" | "caller";
  text: string;
}

const TRANSCRIPT_LINE = /^\[([^\]]+)\]\s*(\w+):\s*(.*)$/;

function parseTranscript(raw: string): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  let first: number | null = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = TRANSCRIPT_LINE.exec(trimmed);
    if (!match) {
      const last = turns[turns.length - 1];
      if (last) last.text += ` ${trimmed}`;
      continue;
    }
    const stamp = Date.parse(match[1]);
    if (first === null && Number.isFinite(stamp)) first = stamp;
    const offsetSeconds =
      Number.isFinite(stamp) && first !== null
        ? Math.max(0, Math.round((stamp - first) / 1000))
        : null;
    turns.push({
      offsetSeconds,
      role: match[2].toLowerCase() === "assistant" ? "agent" : "caller",
      text: match[3],
    });
  }
  return turns;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function dispositionLabel(value: string | null): string {
  if (!value) return "In progress";
  return value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function dispositionVariant(
  value: string | null,
): "accent" | "good" | "warn" | "default" {
  if (!value) return "accent";
  if (value.includes("hangup")) return "good";
  if (value.includes("idle") || value.includes("error")) return "warn";
  return "default";
}

function startedLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: "short",
  }).format(new Date(value));
}

type Filter = "all" | "completed" | "active";

function ConversationsPage({ slug }: { slug: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[] | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.businesses
      .conversations(slug, page)
      .then((result) => {
        if (cancelled) return;
        setConversations(result.conversations);
        setTotalCount(result.totalCount);
        setTotalPages(result.totalPages);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load conversations.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, page]);

  useEffect(() => {
    if (selected === null) {
      setDetail(null);
      setTurns(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setTurns(null);
    setDetailError(null);
    api.businesses
      .conversation(slug, selected)
      .then(async (result) => {
        if (cancelled) return;
        setDetail(result.conversation);
        if (result.conversation.transcriptUrl) {
          try {
            const response = await fetch(result.conversation.transcriptUrl);
            if (!response.ok) throw new Error("Transcript is unavailable.");
            const text = await response.text();
            if (!cancelled) setTurns(parseTranscript(text));
          } catch {
            if (!cancelled) setTurns([]);
          }
        } else {
          setTurns([]);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setDetailError(
          caught instanceof Error
            ? caught.message
            : "Unable to load this conversation.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [slug, selected]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "completed" && !c.completed) return false;
      if (filter === "active" && c.completed) return false;
      if (!q) return true;
      const hay =
        `call ${c.id} ${dispositionLabel(c.disposition)} ${c.mode} ${c.nodesVisited.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, query, filter]);

  const completedTotal = conversations.filter((c) => c.completed).length;
  const activeTotal = conversations.length - completedTotal;

  function renderRow(c: ConversationSummary) {
    const active = selected === c.id;
    return (
      <button
        key={c.id}
        type="button"
        className={`conversations-row ${active ? "conversations-row--selected" : ""}`.trim()}
        onClick={() => {
          setSelected(c.id);
          setMobileDetail(true);
        }}
      >
        <span className="conversations-row__top">
          <span className="conversations-row__who">Call #{c.id} · Web call</span>
          <span className="conversations-row__time">{timeLabel(c.startedAt)}</span>
        </span>
        <span className="conversations-row__summary">
          {startedLabel(c.startedAt)}
          {c.durationSeconds !== null ? ` · ${fmt(c.durationSeconds)}` : ""}
        </span>
        <span className="conversations-row__tags">
          <Pill variant={dispositionVariant(c.completed ? c.disposition : null)}>
            {c.completed ? dispositionLabel(c.disposition) : "In progress"}
          </Pill>
        </span>
      </button>
    );
  }

  const detailContent = (() => {
    if (selected === null) {
      return (
        <div className="conversations-detail__placeholder">
          <EmptyState title="Pick a conversation">
            <span>The transcript and recording will show here.</span>
          </EmptyState>
        </div>
      );
    }
    if (detailError) {
      return (
        <div className="conversations-detail__placeholder">
          <Alert variant="error">{detailError}</Alert>
        </div>
      );
    }
    if (!detail) {
      return (
        <div className="conversations-detail__placeholder">
          <EmptyState title="Loading…">
            <span>Fetching the call details.</span>
          </EmptyState>
        </div>
      );
    }

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
              <h2>Call #{detail.id}</h2>
              <p className="conversations-detail__meta">
                {startedLabel(detail.startedAt)}
                {detail.durationSeconds !== null
                  ? ` · ${fmt(detail.durationSeconds)}`
                  : ""}{" "}
                · {detail.completed ? dispositionLabel(detail.disposition) : "In progress"}
              </p>
            </div>
          </div>

          {detail.recordingUrl ? (
            <audio
              className="conversations-audio"
              controls
              preload="none"
              src={detail.recordingUrl}
              style={{ width: "100%" }}
            />
          ) : (
            <p className="conversations-detail__meta">No recording for this call.</p>
          )}
        </div>

        <div className="conversations-detail__body">
          {turns === null ? (
            <div className="conversations-silent">
              <strong>Loading transcript…</strong>
            </div>
          ) : turns.length === 0 ? (
            <div className="conversations-silent">
              <strong>No transcript</strong>
              <span>
                Nothing was transcribed for this call, or the transcript is not
                ready yet.
              </span>
            </div>
          ) : (
            <div className="conversations-turns">
              {turns.map((turn, i) => {
                const agent = turn.role === "agent";
                return (
                  <div
                    key={i}
                    className={`conversations-turn ${agent ? "conversations-turn--agent" : "conversations-turn--caller"}`.trim()}
                  >
                    {agent ? (
                      <>
                        <span className="conversations-turn__bubble">{turn.text}</span>
                        <span className="conversations-turn__time">
                          {turn.offsetSeconds !== null ? fmt(turn.offsetSeconds) : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="conversations-turn__time">
                          {turn.offsetSeconds !== null ? fmt(turn.offsetSeconds) : ""}
                        </span>
                        <span className="conversations-turn__bubble">{turn.text}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  })();

  const listEmpty = visible.length === 0;

  return (
    <>
      {error ? <Alert variant="error">{error}</Alert> : null}

      <div
        className={`conversations-shell ${selected !== null && mobileDetail ? "conversations-shell--detail" : ""}`.trim()}
      >
        <div className="conversations-list">
          <div className="conversations-header">
            <div className="conversations-title">
              <h2>Conversations</h2>
              <span className="conversations-count">
                {totalCount} TOTAL
              </span>
            </div>

            <div className="conversations-searchbar">
              <SearchIcon size={14} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search calls"
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
                className={`conversations-chip ${filter === "completed" ? "conversations-chip--active" : ""}`.trim()}
                onClick={() => setFilter("completed")}
              >
                Completed {completedTotal}
              </button>
              <button
                type="button"
                className={`conversations-chip ${filter === "active" ? "conversations-chip--active" : ""}`.trim()}
                onClick={() => setFilter("active")}
              >
                In progress {activeTotal}
              </button>
            </div>
          </div>

          <div className="conversations-list__body">
            {loading ? (
              <div className="conversations-first-run">
                <span className="conversations-first-run__icon">
                  <WaveIcon size={22} />
                </span>
                <h3>Loading calls…</h3>
              </div>
            ) : listEmpty ? (
              <div className="conversations-first-run">
                <span className="conversations-first-run__icon">
                  <WaveIcon size={22} />
                </span>
                <h3>No calls yet</h3>
                <p>
                  {query || filter !== "all"
                    ? "No calls match this search or filter."
                    : "The first call that comes in on the website button will land here, with the transcript and recording."}
                </p>
                {query || filter !== "all" ? (
                  <div className="conversations-first-run__actions">
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
                ) : null}
              </div>
            ) : (
              visible.map(renderRow)
            )}
          </div>

          <div className="conversations-footer">
            <span className="conversations-footer__label">
              Page {page} of {Math.max(totalPages, 1)}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Newer
              </Button>
              <Button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Older
              </Button>
            </div>
          </div>
        </div>

        <div className="conversations-detail">{detailContent}</div>
      </div>
    </>
  );
}

export function WorkspaceConversationsPage() {
  return (
    <WorkspaceShell>
      {(business) => <ConversationsPage slug={business.slug} />}
    </WorkspaceShell>
  );
}
