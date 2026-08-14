import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  type Booking,
  type BookingsResponse,
  type CallbackTask,
  type CallbacksResponse,
} from "../api";
import {
  Alert,
  Box,
  Button,
  SelectField,
  TextArea,
  TextField,
} from "../components/ui";
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

// ─── Bookings ───

const START = 480;
const END = 1200;
const HOUR_HEIGHT = 84;
const TOTAL_HEIGHT = ((END - START) / 60) * HOUR_HEIGHT;

type DiaryKind = "ok" | "agentok" | "done" | "missed";

function diaryKind(b: Booking): DiaryKind {
  if (b.status === "arrived") return "done";
  if (b.status === "no_show") return "missed";
  return b.source === "agent" ? "agentok" : "ok";
}

function dayBounds(offset: number): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() + offset);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

function realDayLabel(offset: number): string {
  const { from } = dayBounds(offset);
  const label = from.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${offset === 0 ? "Today · " : ""}${label}`;
}

function startMinutes(b: Booking): number {
  const date = new Date(b.startAt);
  return date.getHours() * 60 + date.getMinutes();
}

function minutesToIso(offset: number, minutes: number): string {
  const { from } = dayBounds(offset);
  from.setMinutes(minutes);
  return from.toISOString();
}

export function WorkspaceBookingsPage() {
  return (
    <WorkspaceShell>{(business) => <BookingsPage slug={business.slug} />}</WorkspaceShell>
  );
}

function BookingsPage({ slug }: { slug: string }) {
  const [tab, setTab] = useState<"Diary" | "Setup">("Diary");
  const [day, setDay] = useState(0);
  const [filter, setFilter] = useState<"all" | "agent" | "attn">("all");
  const [sel, setSel] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  /** Cancelling reaches a real customer, so it takes two deliberate actions. */
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [data, setData] = useState<BookingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  const refresh = useCallback(async () => {
    const { from, to } = dayBounds(day);
    try {
      setData(
        await api.businesses.bookings(
          slug,
          from.toISOString(),
          to.toISOString(),
        ),
      );
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load the diary.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug, day]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const resources = useMemo(
    () => (data?.resources ?? []).filter((r) => r.active),
    [data],
  );

  const visible = useMemo(
    () =>
      (data?.bookings ?? []).filter(
        (b) =>
          b.status !== "cancelled" &&
          startMinutes(b) >= START &&
          startMinutes(b) < END,
      ),
    [data],
  );

  const dim = (b: Booking) => {
    if (filter === "agent") return b.source !== "agent";
    if (filter === "attn") return b.status !== "no_show";
    return false;
  };

  const stats = [
    { v: visible.filter((b) => b.status !== "no_show").length, k: "booked", c: "ops-stat__v" },
    { v: visible.filter((b) => b.source === "agent").length, k: "by the agent", c: "ops-stat__v--accent" },
    { v: visible.filter((b) => b.status === "arrived").length, k: "arrived", c: "ops-stat__v" },
    { v: visible.filter((b) => b.status === "no_show").length, k: "no-shows", c: "ops-stat__v--warn" },
  ];

  const selected = sel ? visible.find((b) => b.id === sel) : undefined;

  const update = async (
    bookingId: string,
    input: Parameters<typeof api.businesses.updateBooking>[2],
    done: string,
  ) => {
    try {
      await api.businesses.updateBooking(slug, bookingId, input);
      await refresh();
      say(done);
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "That did not work.");
    }
  };

  const handleNudge = (m: number) => {
    if (!selected) return;
    const s2 = Math.max(
      START,
      Math.min(END - selected.durationMinutes, startMinutes(selected) + m),
    );
    if (s2 === startMinutes(selected)) return;
    void update(
      selected.id,
      { startAt: minutesToIso(day, s2) },
      `Nudged to ${clock(s2)}`,
    );
  };

  const handleReassign = (resourceId: string) => {
    if (!selected || resourceId === selected.resourceId) return;
    const name = resources.find((r) => r.id === resourceId)?.name ?? "";
    void update(selected.id, { resourceId }, `Now with ${name}`);
  };

  return (
    <>
            <div className="ops-page">
              <div className="ops-main">
                <div className="ops-header">
                  <div className="ops-header__row">
                    <div className="ops-header__left">
                      <h1 className="ops-title">Bookings</h1>
                      <div className="ops-tabs">
                        {(["Diary", "Setup"] as const).map((item) => (
                          <button
                            type="button"
                            key={item}
                            className={`ops-tab ${tab === item ? "ops-tab--active" : ""}`}
                            onClick={() => {
                              setTab(item);
                              setSel(null);
                            }}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ops-toolbar">
                      {tab === "Diary" && (
                        <div className="ops-day">
                          <button type="button" className="ops-step" onClick={() => setDay((d) => d - 1)}>
                            ←
                          </button>
                          <span className="ops-day__label">{realDayLabel(day)}</span>
                          <button type="button" className="ops-step" onClick={() => setDay((d) => d + 1)}>
                            →
                          </button>
                          <Button variant="default" onClick={() => setDay(0)}>
                            Today
                          </Button>
                        </div>
                      )}
                      {data?.canManage && tab === "Diary" ? (
                        <Button variant="primary" onClick={() => setNewOpen((o) => !o)}>
                          {newOpen ? "Close" : "New booking"}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {tab === "Diary" && (
                    <div className="ops-header__row">
                      <div className="ops-stats">
                        {stats.map((s) => (
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

                {error ? <Alert variant="error">{error}</Alert> : null}

                {tab === "Diary" ? (
                  loading ? (
                    <Box padding="lg">
                      <p className="auth-card-copy">Loading the diary…</p>
                    </Box>
                  ) : resources.length === 0 ? (
                    <Box padding="lg">
                      <h2>No diary columns yet</h2>
                      <p className="auth-card-copy">
                        Add the people and rooms that take bookings under Setup,
                        then the diary fills in here.
                      </p>
                      {data?.canConfigure ? (
                        <Button variant="primary" onClick={() => setTab("Setup")}>
                          Open Setup
                        </Button>
                      ) : null}
                    </Box>
                  ) : (
                    <div className="bookings-grid-wrap">
                      <div
                        className="bookings-grid"
                        style={{
                          height: 44 + TOTAL_HEIGHT,
                          gridTemplateColumns: `56px repeat(${resources.length}, 1fr)`,
                        }}
                      >
                        <div className="bookings-grid__head--gutter" />
                        {resources.map((r) => (
                          <div className="bookings-grid__head" key={r.id}>
                            <span className="bookings-grid__name">{r.name}</span>
                            <span className="bookings-grid__sub">{r.subtitle}</span>
                          </div>
                        ))}

                        <div className="bookings-gutter" style={{ height: TOTAL_HEIGHT }}>
                          {Array.from({ length: (END - START) / 60 }, (_, i) => (
                            <span key={i} className="bookings-hour" style={{ top: i * HOUR_HEIGHT }}>
                              {clock(START + i * 60)}
                            </span>
                          ))}
                        </div>

                        {resources.map((r) => (
                          <div className="bookings-track" key={r.id} style={{ height: TOTAL_HEIGHT }}>
                            {visible
                              .filter((b) => b.resourceId === r.id)
                              .map((b) => {
                                const s = startMinutes(b);
                                const h = Math.max(20, (b.durationMinutes / 60) * HOUR_HEIGHT - 4);
                                const compact = h < 46;
                                const top = ((s - START) / 60) * HOUR_HEIGHT;
                                const className = [
                                  "bookings-block",
                                  `bookings-block--${diaryKind(b)}`,
                                  compact ? "bookings-block--compact" : "",
                                  sel === b.id ? "bookings-block--selected" : "",
                                  dim(b) ? "bookings-block--dim" : "",
                                ].join(" ");
                                return (
                                  <button
                                    type="button"
                                    key={b.id}
                                    className={className}
                                    style={{ top, height: h }}
                                    onClick={() => setSel(b.id)}
                                  >
                                    <span className="bookings-block__time">{clock(s)}</span>
                                    <span className="bookings-block__title">
                                      {compact
                                        ? b.customerName
                                          ? `${b.title} · ${b.customerName}`
                                          : b.title
                                        : b.title}
                                    </span>
                                    {!compact && b.customerName && (
                                      <span className="bookings-block__sub">{b.customerName}</span>
                                    )}
                                  </button>
                                );
                              })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  <BookingsSetup
                    slug={slug}
                    data={data}
                    onChanged={refresh}
                    say={say}
                  />
                )}
              </div>

              <div className="ops-rail">
                {tab === "Diary" && newOpen && data ? (
                  <NewBookingForm
                    slug={slug}
                    day={day}
                    data={data}
                    onCreated={async () => {
                      setNewOpen(false);
                      await refresh();
                      say("Booked");
                    }}
                  />
                ) : null}

                {tab === "Diary" && selected && (
                  <div className="bookings-detail">
                    <div className="bookings-detail__head">
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                        <span
                          className="bookings-detail__tag"
                          style={
                            selected.status === "no_show"
                              ? { color: "var(--accent-ink)", background: "var(--accent-soft)", borderColor: "var(--accent)" }
                              : selected.source === "agent"
                                ? { color: "var(--good)", background: "var(--good-soft)", borderColor: "var(--good)" }
                                : { color: "var(--ink-2)", background: "var(--paper-2)", borderColor: "var(--line)" }
                          }
                        >
                          {selected.status === "no_show"
                            ? "DID NOT ARRIVE"
                            : selected.source === "agent"
                              ? "BOOKED BY THE AGENT"
                              : selected.source === "web"
                                ? "BOOKED ON THE WEBSITE"
                                : "BOOKED AT THE DESK"}
                        </span>
                        <h2 className="bookings-detail__title">
                          {selected.customerName || selected.title}
                        </h2>
                        <span className="bookings-detail__when">
                          {clock(startMinutes(selected))}–
                          {clock(startMinutes(selected) + selected.durationMinutes)} ·{" "}
                          {realDayLabel(day).replace("Today · ", "")}
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
                        { k: "service", v: `${selected.title} · ${selected.durationMinutes} min` },
                        { k: "with", v: resources.find((r) => r.id === selected.resourceId)?.name ?? "—" },
                        { k: "phone", v: selected.customerPhone || "—" },
                        { k: "price", v: selected.price || "—" },
                        { k: "note", v: selected.note || "—" },
                      ].map((f) => (
                        <div className="bookings-fact" key={f.k}>
                          <span className="bookings-fact__k">{f.k}</span>
                          <span className="bookings-fact__v">{f.v}</span>
                        </div>
                      ))}
                    </div>

                    {data?.canManage && (
                      <>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          <Button variant="default" onClick={() => setMoveOpen((o) => !o)}>
                            {moveOpen ? "Done" : "Move"}
                          </Button>
                          {selected.status !== "arrived" && (
                            <Button
                              variant="default"
                              onClick={() =>
                                void update(selected.id, { status: "arrived" }, "Marked as arrived")
                              }
                            >
                              Mark arrived
                            </Button>
                          )}
                          {selected.status !== "no_show" && (
                            <Button
                              variant="default"
                              onClick={() =>
                                void update(selected.id, { status: "no_show" }, "Marked as a no-show")
                              }
                            >
                              No-show
                            </Button>
                          )}
                          {confirmCancel === selected.id ? (
                            <>
                              <span className="bookings-confirm">
                                Cancel this booking for {selected.customerName || "this customer"}?
                              </span>
                              <Button
                                variant="destructive"
                                onClick={() => {
                                  setConfirmCancel(null);
                                  setSel(null);
                                  void update(
                                    selected.id,
                                    { status: "cancelled" },
                                    "Booking cancelled",
                                  );
                                }}
                              >
                                Yes, cancel it
                              </Button>
                              <Button onClick={() => setConfirmCancel(null)}>
                                Keep it
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="destructive"
                              onClick={() => setConfirmCancel(selected.id)}
                            >
                              Cancel booking
                            </Button>
                          )}
                        </div>

                        {moveOpen && (
                          <div className="bookings-move">
                            <div className="bookings-nudge">
                              <Button variant="default" onClick={() => handleNudge(-10)}>−10 min</Button>
                              <span className="bookings-nudge__time">{clock(startMinutes(selected))}</span>
                              <Button variant="default" onClick={() => handleNudge(10)}>+10 min</Button>
                            </div>
                            <div className="bookings-people">
                              {resources.map((r) => (
                                <button
                                  type="button"
                                  key={r.id}
                                  className={`ops-chip ${r.id === selected.resourceId ? "ops-chip--active" : ""}`}
                                  onClick={() => handleReassign(r.id)}
                                >
                                  {r.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <div className="bookings-detail__links">
                      <Link to="/app/$businessSlug/contacts" params={{ businessSlug: slug }}>Open contact</Link>
                      {selected.runId ? (
                        <Link to="/app/$businessSlug/conversations" params={{ businessSlug: slug }}>Hear the call</Link>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>

      {/* role=status + aria-live so confirmations and errors are actually announced. */}
      <div className="ops-toast__region" role="status" aria-live="polite">
        {toast && <div className="ops-toast">{toast}</div>}
      </div>
    </>
  );
}

function NewBookingForm({
  slug,
  day,
  data,
  onCreated,
}: {
  slug: string;
  day: number;
  data: BookingsResponse;
  onCreated: () => Promise<void>;
}) {
  const services = data.services.filter((s) => s.active);
  const resources = data.resources.filter((r) => r.active);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? "");
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [time, setTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId);

  async function save() {
    if (!resourceId) {
      setError("Pick who or what the booking is with.");
      return;
    }
    const [h, m] = time.split(":").map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
      setError("Pick a start time.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.businesses.createBooking(slug, {
        resourceId,
        serviceId: service?.id ?? null,
        title: service?.name ?? "Booking",
        customerName: customer,
        customerPhone,
        startAt: minutesToIso(day, h * 60 + m),
        durationMinutes: service?.durationMinutes ?? 30,
        price: service?.price ?? "",
      });
      await onCreated();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to create the booking.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box padding="sm" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="bookings-section-label">New booking</span>
      {services.length === 0 ? (
        <p className="auth-card-copy">
          Add a service under Setup first, so the booking knows its length and price.
        </p>
      ) : (
        <>
          <SelectField
            label="Service"
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            options={services.map((s) => ({
              value: s.id,
              label: `${s.name} · ${s.durationMinutes} min`,
            }))}
          />
          <SelectField
            label="With"
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            options={resources.map((r) => ({ value: r.id, label: r.name }))}
          />
          <TextField
            label="Who is it for"
            value={customer}
            onChange={(event) => setCustomer(event.target.value)}
          />
          <TextField
            label="Their phone (optional)"
            type="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
          />
          <TextField
            label="Start time"
            type="time"
            step={600}
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
          {error ? <Alert variant="error">{error}</Alert> : null}
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Book it
          </Button>
        </>
      )}
    </Box>
  );
}

function BookingsSetup({
  slug,
  data,
  onChanged,
  say,
}: {
  slug: string;
  data: BookingsResponse | null;
  onChanged: () => Promise<void>;
  say: (m: string) => void;
}) {
  const [svcName, setSvcName] = useState("");
  const [svcDuration, setSvcDuration] = useState("30");
  const [svcPrice, setSvcPrice] = useState("");
  const [resName, setResName] = useState("");
  const [resSubtitle, setResSubtitle] = useState("");
  const [resKind, setResKind] = useState<"person" | "room">("person");
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;
  const canConfigure = data.canConfigure;

  async function addService() {
    const duration = Number(svcDuration);
    if (!svcName.trim() || !Number.isInteger(duration) || duration < 5) {
      setError("A service needs a name and a length in minutes.");
      return;
    }
    setError(null);
    try {
      await api.businesses.createBookingService(slug, {
        name: svcName,
        durationMinutes: duration,
        price: svcPrice,
      });
      setSvcName("");
      setSvcPrice("");
      await onChanged();
      say("Service added");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add the service.");
    }
  }

  async function addResource() {
    if (!resName.trim()) {
      setError("Give the diary column a name.");
      return;
    }
    setError(null);
    try {
      await api.businesses.createBookingResource(slug, {
        name: resName,
        subtitle: resSubtitle,
        kind: resKind,
      });
      setResName("");
      setResSubtitle("");
      await onChanged();
      say("Diary column added");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add the column.");
    }
  }

  return (
    <div className="bookings-setup">
      {error ? <Alert variant="error">{error}</Alert> : null}
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
          {data.services.filter((s) => s.active).map((s) => (
            <div className="bookings-table__row" key={s.id}>
              <span>
                <span className="bookings-service__name">{s.name}</span>
              </span>
              <span className="bookings-td">{s.durationMinutes} min</span>
              <span className="bookings-td">{s.bufferMinutes ? `${s.bufferMinutes} min` : "—"}</span>
              <span className="bookings-td">{s.price || "—"}</span>
              <span className="bookings-td">{s.deposit || "—"}</span>
              <button
                type="button"
                className={`bookings-toggle ${s.agentBookable ? "bookings-toggle--on" : "bookings-toggle--off"}`}
                disabled={!canConfigure}
                onClick={() =>
                  void api.businesses
                    .updateBookingService(slug, s.id, { agentBookable: !s.agentBookable })
                    .then(onChanged)
                    .catch((caught: unknown) =>
                      setError(caught instanceof Error ? caught.message : "Unable to update."),
                    )
                }
              >
                {s.agentBookable ? "Yes" : "Only humans"}
              </button>
              {canConfigure ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void api.businesses
                      .updateBookingService(slug, s.id, { active: false })
                      .then(onChanged)
                      .catch((caught: unknown) =>
                        setError(
                          caught instanceof Error ? caught.message : "Unable to remove.",
                        ),
                      )
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {canConfigure ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
            <TextField
              label="New service"
              placeholder="Check-up"
              value={svcName}
              onChange={(event) => setSvcName(event.target.value)}
            />
            <TextField
              label="Minutes"
              value={svcDuration}
              onChange={(event) => setSvcDuration(event.target.value)}
            />
            <TextField
              label="Price"
              placeholder="£45"
              value={svcPrice}
              onChange={(event) => setSvcPrice(event.target.value)}
            />
            <Button variant="primary" onClick={() => void addService()}>
              Add service
            </Button>
          </div>
        ) : null}
      </div>

      <div className="bookings-cards">
        {data.resources.filter((r) => r.active).map((r) => (
          <div className="bookings-card" key={r.id}>
            <span className="bookings-card__kind">{r.kind === "person" ? "Person" : "Room"}</span>
            <span className="bookings-card__name">{r.name}</span>
            <span className="bookings-card__line">{r.subtitle || "—"}</span>
            <span className="bookings-card__muted">{r.hours || r.notes || ""}</span>
            {canConfigure ? (
              <Button
                variant="ghost"
                onClick={() =>
                  void api.businesses
                    .updateBookingResource(slug, r.id, { active: false })
                    .then(onChanged)
                    .catch((caught: unknown) =>
                      setError(caught instanceof Error ? caught.message : "Unable to remove."),
                    )
                }
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {canConfigure ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <TextField
            label="New diary column"
            placeholder="Dr. Reyes"
            value={resName}
            onChange={(event) => setResName(event.target.value)}
          />
          <TextField
            label="Role"
            placeholder="Dentist"
            value={resSubtitle}
            onChange={(event) => setResSubtitle(event.target.value)}
          />
          <SelectField
            label="Kind"
            value={resKind}
            onChange={(event) => setResKind(event.target.value as "person" | "room")}
            options={[
              { value: "person", label: "Person" },
              { value: "room", label: "Room" },
            ]}
          />
          <Button variant="primary" onClick={() => void addResource()}>
            Add column
          </Button>
        </div>
      ) : null}
    </div>
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
  const [loadingMore, setLoadingMore] = useState(false);
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

  const loadMore = async () => {
    if (loadingMore || !data) return;
    setLoadingMore(true);
    try {
      const result = await api.businesses.callbacks(slug, data.callbacks.length);
      setData((prev) =>
        prev
          ? {
              ...result,
              callbacks: [...prev.callbacks, ...result.callbacks],
            }
          : result,
      );
    } catch (caught) {
      say(caught instanceof Error ? caught.message : "Unable to load more.");
    } finally {
      setLoadingMore(false);
    }
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
              null
            )}
            {!loadError && data && groups.length > 0 && data.hasMore ? (
              <Button variant="ghost" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            ) : null}
            {data && groups.length === 0 && !loadError ? (
              <div className="callbacks-empty">
                <span className="callbacks-empty__title">{emptyTitle}</span>
                <span className="callbacks-empty__line">{emptyLine}</span>
                {allRows.length > 0 && (
                  <Button variant="default" onClick={() => setFilter("all")}>
                    Show everything
                  </Button>
                )}
              </div>
            ) : null}
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
                    <Link to="/app/$businessSlug/conversations" params={{ businessSlug: slug }}>The call ↗</Link>
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

      {/* role=status + aria-live so confirmations and errors are actually announced. */}
      <div className="ops-toast__region" role="status" aria-live="polite">
        {toast && <div className="ops-toast">{toast}</div>}
      </div>
    </>
  );
}

export function WorkspaceCallbacksPage() {
  return (
    <WorkspaceShell>{(business) => <CallbacksPage slug={business.slug} />}</WorkspaceShell>
  );
}
