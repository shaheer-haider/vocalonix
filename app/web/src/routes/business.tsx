import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  api,
  ApiClientError,
  type Booking,
  type BusinessSummary,
  type CallbackTask,
  type DashboardStats,
  type KnowledgeGap,
  type PendingInvitation,
  type Role,
  type TeamMember,
} from "../api";
import { useAuth } from "../auth/AuthProvider";
import { AuthShell } from "../components/shell";
import { DemoLink } from "../components/DemoLink";
import {
  Alert,
  Box,
  Button,
  EmptyState,
  LoadingState,
  Modal,
  Pill,
  SelectField,
  TextArea,
  TextField,
} from "../components/ui";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  ChatIcon,
  PhoneIcon,
  SettingsIcon,
  UsersIcon,
} from "../icons";
import { can, permissionRows, roles } from "../permissions";
import { AccountContent } from "./account";

const createBusinessSchema = z.object({
  name: z.string().min(2, "Enter a business name."),
  contactEmail: z.string().email("Enter a valid email.").optional().or(z.literal("")),
  city: z.string().max(120).optional(),
  country: z.string().length(2, "Use a two-letter country code."),
  timezone: z.string().min(1, "Select a timezone."),
  vertical: z.string().min(1, "Select a vertical."),
  locations: z.string().min(1, "Select a location count."),
});

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email."),
  role: z.enum(["Owner", "Admin", "Manager", "Staff", "Viewer"]),
});

type CreateBusinessValues = z.infer<typeof createBusinessSchema>;
type InviteValues = z.infer<typeof inviteSchema>;

export const COUNTRY_OPTIONS = [
  { label: "Afghanistan", value: "AF" },
  { label: "Albania", value: "AL" },
  { label: "Algeria", value: "DZ" },
  { label: "Argentina", value: "AR" },
  { label: "Australia", value: "AU" },
  { label: "Austria", value: "AT" },
  { label: "Bangladesh", value: "BD" },
  { label: "Belgium", value: "BE" },
  { label: "Brazil", value: "BR" },
  { label: "Bulgaria", value: "BG" },
  { label: "Canada", value: "CA" },
  { label: "Chile", value: "CL" },
  { label: "China", value: "CN" },
  { label: "Colombia", value: "CO" },
  { label: "Croatia", value: "HR" },
  { label: "Czech Republic", value: "CZ" },
  { label: "Denmark", value: "DK" },
  { label: "Egypt", value: "EG" },
  { label: "Estonia", value: "EE" },
  { label: "Finland", value: "FI" },
  { label: "France", value: "FR" },
  { label: "Germany", value: "DE" },
  { label: "Greece", value: "GR" },
  { label: "Hong Kong", value: "HK" },
  { label: "Hungary", value: "HU" },
  { label: "Iceland", value: "IS" },
  { label: "India", value: "IN" },
  { label: "Indonesia", value: "ID" },
  { label: "Ireland", value: "IE" },
  { label: "Israel", value: "IL" },
  { label: "Italy", value: "IT" },
  { label: "Japan", value: "JP" },
  { label: "Kenya", value: "KE" },
  { label: "Latvia", value: "LV" },
  { label: "Lithuania", value: "LT" },
  { label: "Malaysia", value: "MY" },
  { label: "Mexico", value: "MX" },
  { label: "Netherlands", value: "NL" },
  { label: "New Zealand", value: "NZ" },
  { label: "Nigeria", value: "NG" },
  { label: "Norway", value: "NO" },
  { label: "Pakistan", value: "PK" },
  { label: "Philippines", value: "PH" },
  { label: "Poland", value: "PL" },
  { label: "Portugal", value: "PT" },
  { label: "Romania", value: "RO" },
  { label: "Russia", value: "RU" },
  { label: "Saudi Arabia", value: "SA" },
  { label: "Serbia", value: "RS" },
  { label: "Singapore", value: "SG" },
  { label: "Slovakia", value: "SK" },
  { label: "Slovenia", value: "SI" },
  { label: "South Africa", value: "ZA" },
  { label: "South Korea", value: "KR" },
  { label: "Spain", value: "ES" },
  { label: "Sweden", value: "SE" },
  { label: "Switzerland", value: "CH" },
  { label: "Taiwan", value: "TW" },
  { label: "Thailand", value: "TH" },
  { label: "Turkey", value: "TR" },
  { label: "Ukraine", value: "UA" },
  { label: "United Arab Emirates", value: "AE" },
  { label: "United Kingdom", value: "GB" },
  { label: "United States", value: "US" },
  { label: "Vietnam", value: "VN" },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function useBusinessSlug(): string {
  const params = useParams({ strict: false }) as { businessSlug?: string };
  return params.businessSlug ?? "";
}

function useToken(): string {
  const params = useParams({ strict: false }) as { token?: string };
  return params.token ?? "";
}

function useBusinesses() {
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBusinesses(await api.businesses.list());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load workspaces.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { businesses, error, loading, refresh };
}

function workspaceTarget(pathname: string, targetSlug: string): string {
  const remainder = pathname.replace(/^\/app\/[^/]+/, "");
  const isWorkspaceSection =
    /^\/(dashboard|conversations|contacts|bookings|callbacks|notifications|team|settings|onboarding|billing|account)(?:\/|$)/.test(
      remainder,
    );
  return `/app/${targetSlug}${isWorkspaceSection ? remainder : "/dashboard"}`;
}

export function WorkspaceShell({
  children,
  requiredPermission,
}: {
  children: (business: BusinessSummary) => ReactNode;
  requiredPermission?: Parameters<typeof can>[1];
}) {
  const slug = useBusinessSlug();
  const { businesses, error, loading } = useBusinesses();
  const business = useMemo(
    () => businesses.find((candidate) => candidate.slug === slug),
    [businesses, slug],
  );

  if (loading) return <LoadingState label="Loading workspace…" />;

  if (error) {
    return (
      <AuthShell width={620}>
        <Alert variant="error">{error}</Alert>
      </AuthShell>
    );
  }

  if (!business) {
    return (
      <AuthShell width={620}>
        <Box style={{ padding: 24 }}>
          <h1 className="account-title">Workspace not found</h1>
          <p className="auth-card-copy">
            This workspace is unavailable or your membership was removed.
          </p>
          <Link className="ui-button ui-button--primary" to="/app">
            Return to app
          </Link>
        </Box>
      </AuthShell>
    );
  }

  if (requiredPermission && !can(business.role, requiredPermission)) {
    return (
      <WorkspaceFrame business={business} businesses={businesses}>
        <Box style={{ padding: 24 }}>
          <Pill variant="warn">{business.role}</Pill>
          <h1 className="account-title">You do not have access here</h1>
          <p className="auth-card-copy">
            Ask an Owner or Admin to update your workspace role.
          </p>
        </Box>
      </WorkspaceFrame>
    );
  }

  return (
    <WorkspaceFrame business={business} businesses={businesses}>
      {children(business)}
    </WorkspaceFrame>
  );
}

function navActiveClass(active: boolean): string {
  return `nav-item ${active ? "nav-item--active" : ""}`.trim();
}

function WorkspaceFrame({
  business,
  businesses,
  children,
}: {
  business: BusinessSummary;
  businesses: BusinessSummary[];
  children: ReactNode;
}) {
  const location = useLocation();
  const pathname = location.pathname;

  const dashboardHref = `/app/${business.slug}/dashboard`;
  const conversationsHref = `/app/${business.slug}/conversations`;
  const contactsHref = `/app/${business.slug}/contacts`;
  const bookingsHref = `/app/${business.slug}/bookings`;
  const callbacksHref = `/app/${business.slug}/callbacks`;
  const settingsHref = `/app/${business.slug}/settings`;
  const knowledgeHref = `${settingsHref}/knowledge`;
  const teamHref = `/app/${business.slug}/team`;
  const accountHref = `/app/${business.slug}/account`;
  const notificationsHref = `/app/${business.slug}/notifications`;

  const isDashboard = pathname === dashboardHref;
  const isConversations = pathname.startsWith(conversationsHref);
  const isContacts = pathname.startsWith(contactsHref);
  const isBookings = pathname.startsWith(bookingsHref);
  const isCallbacks = pathname.startsWith(callbacksHref);
  const isSettings =
    pathname.startsWith(settingsHref) && !pathname.startsWith(knowledgeHref);
  const isKnowledge = pathname.startsWith(knowledgeHref);
  const isTeam = pathname.startsWith(teamHref);
  const isAccount = pathname.startsWith(accountHref);
  const isNotifications = pathname.startsWith(notificationsHref);

  const [counts, setCounts] = useState({ callbacks: 0, gaps: 0 });

  useEffect(() => {
    let cancelled = false;
    api.businesses
      .overview(business.slug)
      .then((overview) => {
        if (!cancelled) {
          setCounts({
            callbacks: overview.openCallbacks,
            gaps: overview.openGaps,
          });
        }
      })
      .catch(() => {
        // Badge counts are decorative; leave them at zero on failure.
      });
    return () => {
      cancelled = true;
    };
  }, [business.slug]);

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="wordmark" to="/">
          vocalonix
        </Link>
        <label className="workspace-switcher">
          <span>Workspace</span>
          <select
            value={business.slug}
            onChange={(event) => {
              window.location.assign(
                workspaceTarget(window.location.pathname, event.target.value),
              );
            }}
          >
            {businesses.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Workspace">
          <p className="nav-section">Today</p>
          <Link
            className={navActiveClass(isDashboard)}
            aria-current={isDashboard ? "page" : undefined}
            to={dashboardHref}
          >
            <CalendarIcon size={18} />
            Dashboard
          </Link>
          <Link
            className={navActiveClass(isConversations)}
            aria-current={isConversations ? "page" : undefined}
            to={conversationsHref}
          >
            <ChatIcon size={18} />
            Conversations
          </Link>
          <Link
            className={navActiveClass(isContacts)}
            aria-current={isContacts ? "page" : undefined}
            to={contactsHref}
          >
            <UsersIcon size={18} />
            Contacts
          </Link>
          <Link
            className={navActiveClass(isBookings)}
            aria-current={isBookings ? "page" : undefined}
            to={bookingsHref}
          >
            <CalendarIcon size={18} />
            Bookings
          </Link>
          <Link
            className={navActiveClass(isCallbacks)}
            aria-current={isCallbacks ? "page" : undefined}
            to={callbacksHref}
          >
            <PhoneIcon size={18} />
            Callbacks
            {counts.callbacks > 0 ? (
              <span className="nav-item__count">{counts.callbacks}</span>
            ) : null}
          </Link>
          <p className="nav-section">Set up</p>
          <Link
            className={navActiveClass(isSettings)}
            aria-current={isSettings ? "page" : undefined}
            to={settingsHref}
          >
            <SettingsIcon size={18} />
            Configuration
          </Link>
          {can(business.role, "knowledge.manage") ? (
            <Link
              className={navActiveClass(isKnowledge)}
              aria-current={isKnowledge ? "page" : undefined}
              to={knowledgeHref}
            >
              <BookIcon size={18} />
              Knowledge
              {counts.gaps > 0 ? (
                <span className="nav-item__count">{counts.gaps}</span>
              ) : null}
            </Link>
          ) : null}
          <p className="nav-section">Workspace</p>
          {can(business.role, "team.manage") ? (
            <Link
              className={navActiveClass(isTeam)}
              aria-current={isTeam ? "page" : undefined}
              to={teamHref}
            >
              <UsersIcon size={18} />
              Team
            </Link>
          ) : null}
          <Link
            className={navActiveClass(isAccount)}
            aria-current={isAccount ? "page" : undefined}
            to={accountHref}
          >
            <PhoneIcon size={18} />
            Account &amp; billing
          </Link>
          <Link
            className={navActiveClass(isNotifications)}
            aria-current={isNotifications ? "page" : undefined}
            to={notificationsHref}
          >
            <BellIcon size={18} />
            Notifications
          </Link>
          <DemoLink className="nav-item">
            <SettingsIcon size={18} />
            Hear it now
          </DemoLink>
        </nav>
        <div className="sidebar-status">
          <div className="sidebar-status__head">
            <span className="sidebar-status__dot" />
            Live &amp; answering
          </div>
          Your agent picks up calls and website chats for {business.name}.
        </div>
      </aside>
      <main className="workspace-main">
        <div className="workspace-topbar">
          <div>
            <p className="eyebrow">{business.role}</p>
            <h1>{business.name}</h1>
          </div>
          <Link className="ui-button" to="/app/onboarding/create">
            New workspace
          </Link>
        </div>
        {children}
      </main>
      <nav className="mobile-bottom-nav" aria-label="Mobile">
        <Link
          className={navActiveClass(isDashboard)}
          to={dashboardHref}
          aria-label="Today"
        >
          <CalendarIcon size={20} />
          <span>Today</span>
        </Link>
        <Link
          className={navActiveClass(isBookings)}
          to={bookingsHref}
          aria-label="Diary"
        >
          <CalendarIcon size={20} />
          <span>Diary</span>
        </Link>
        <Link
          className={navActiveClass(isCallbacks)}
          to={callbacksHref}
          aria-label="Callbacks"
        >
          <PhoneIcon size={20} />
          <span>Callbacks</span>
          {counts.callbacks > 0 ? (
            <span className="nav-item__count nav-item__count--bottom">{counts.callbacks}</span>
          ) : null}
        </Link>
        <Link
          className={navActiveClass(isConversations)}
          to={conversationsHref}
          aria-label="Calls"
        >
          <ChatIcon size={20} />
          <span>Calls</span>
        </Link>
      </nav>
    </div>
  );
}

function mapDemoVertical(slug: string): string {
  switch (slug) {
    case "spa":
    case "mental_health":
      return "Wellness";
    case "medspa":
      return "Med spa";
    case "dental":
    case "vet":
    case "funeral":
    case "home_services":
      return "Other";
    case "salon":
    case "barber":
    case "pmu":
    case "nail_lash":
    default:
      return "Beauty";
  }
}

export function CreateBusinessPage() {
  const createParams = new URLSearchParams(window.location.search);
  const demoBusiness = createParams.get("demoBusiness") ?? "";
  const demoCity = createParams.get("demoCity") ?? "";
  const demoVertical = createParams.get("demoVertical") ?? "";

  const form = useForm<CreateBusinessValues>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: {
      name: demoBusiness,
      contactEmail: "",
      city: demoCity,
      country: "US",
      timezone: "America/New_York",
      vertical: demoVertical ? mapDemoVertical(demoVertical) : "Beauty",
      locations: "1",
    },
  });
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <AuthShell width={560}>
      <div className="auth-header">
        <Link to="/" className="wordmark">
          vocalonix
        </Link>
      </div>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setNotice(null);
          const baseSlug = slugify(values.name) || "workspace";
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
            try {
              const business = await api.businesses.create({
                ...values,
                contactEmail: values.contactEmail || undefined,
                city: values.city || undefined,
                slug,
              });
              window.location.replace(
                `/app/${business.slug}/onboarding/business-profile`,
              );
              return;
            } catch (caught) {
              if (
                caught instanceof ApiClientError &&
                caught.code === "SLUG_TAKEN" &&
                attempt < 4
              ) {
                continue;
              }
              setNotice(
                caught instanceof Error
                  ? caught.message
                  : "Unable to create this workspace.",
              );
              return;
            }
          }
        })}
      >
        <Box style={{ padding: 24 }}>
          <p className="eyebrow">Step 1 of 1</p>
          <h1 className="account-title">Create a business workspace</h1>
          <p className="auth-card-copy">
            This creates the business, your Owner membership, and a pending
            Dograh workflow mapping in one transaction.
          </p>
          <div className="form-grid">
            <TextField
              label="Business name"
              error={form.formState.errors.name?.message}
              required
              {...form.register("name")}
            />
            <TextField
              label="Contact email"
              type="email"
              error={form.formState.errors.contactEmail?.message}
              {...form.register("contactEmail")}
            />
            <TextField
              label="City"
              error={form.formState.errors.city?.message}
              {...form.register("city")}
            />
            <SelectField
              label="Country"
              error={form.formState.errors.country?.message}
              required
              options={COUNTRY_OPTIONS}
              {...form.register("country")}
            />
            <SelectField
              label="Timezone"
              error={form.formState.errors.timezone?.message}
              options={[
                { label: "Eastern", value: "America/New_York" },
                { label: "Central", value: "America/Chicago" },
                { label: "Mountain", value: "America/Denver" },
                { label: "Pacific", value: "America/Los_Angeles" },
              ]}
              {...form.register("timezone")}
            />
            <SelectField
              label="Vertical"
              error={form.formState.errors.vertical?.message}
              options={[
                { label: "Beauty", value: "Beauty" },
                { label: "Med spa", value: "Med spa" },
                { label: "Wellness", value: "Wellness" },
                { label: "Other", value: "Other" },
              ]}
              {...form.register("vertical")}
            />
            <SelectField
              label="Locations"
              error={form.formState.errors.locations?.message}
              options={[
                { label: "1", value: "1" },
                { label: "2", value: "2" },
                { label: "3–5", value: "3-5" },
                { label: "6+", value: "6+" },
              ]}
              {...form.register("locations")}
            />
          </div>
          {notice ? <Alert variant="error">{notice}</Alert> : null}
          <div style={{ marginTop: 22 }}>
            <Button
              type="submit"
              variant="primary"
              className="full-width"
              loading={form.formState.isSubmitting}
            >
              Create workspace →
            </Button>
          </div>
        </Box>
      </form>
    </AuthShell>
  );
}

function formatCallLength(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s < 10 ? "0" : ""}${s}s`;
}

function dispositionText(value: string | null): string {
  if (!value) return "In progress";
  return value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export function WorkspaceDashboardPage() {
  const [range, setRange] = useState<"today" | "7d" | "30d">("today");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const slug = useBusinessSlug();

  useEffect(() => {
    let cancelled = false;
    setStatsError(null);
    api.businesses
      .dashboard(slug, range)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setStatsError(
          caught instanceof Error
            ? caught.message
            : "Unable to load call stats.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [slug, range]);

  const hourly = stats?.hourly.slice(8, 20) ?? new Array<number>(12).fill(0);
  const hourlyMax = Math.max(1, ...hourly);

  const [callbackQueue, setCallbackQueue] = useState<CallbackTask[]>([]);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [diary, setDiary] = useState<Booking[]>([]);

  useEffect(() => {
    let cancelled = false;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    void api.businesses
      .callbacks(slug)
      .then((result) => {
        if (cancelled) return;
        setCallbackQueue(
          result.callbacks.filter((task) => task.status === "open").slice(0, 3),
        );
      })
      .catch(() => undefined);
    void api.businesses
      .knowledgeGaps(slug)
      .then((result) => {
        if (cancelled) return;
        setGaps(
          result.gaps
            .filter((gap) => gap.status === "open")
            .sort((a, b) => b.askCount - a.askCount)
            .slice(0, 3),
        );
      })
      .catch(() => undefined);
    void api.businesses
      .bookings(slug, dayStart.toISOString(), dayEnd.toISOString())
      .then((result) => {
        if (cancelled) return;
        setDiary(
          result.bookings
            .filter((booking) => booking.status !== "cancelled")
            .slice(0, 4),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <WorkspaceShell>
      {(business) => (
        <>
          {statsError ? <Alert variant="error">{statsError}</Alert> : null}

          <div className="dash-header" style={{ marginTop: 16 }}>
            <div>
              <p className="eyebrow">Briefing</p>
              <h1>Today</h1>
            </div>
            <div className="dash-range">
              {(["today", "7d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`ops-chip ${range === r ? "ops-chip--active" : ""}`.trim()}
                  onClick={() => setRange(r)}
                >
                  {r === "today" ? "Today" : r === "7d" ? "7 days" : "30 days"}
                </button>
              ))}
            </div>
          </div>

          <div className="dash-stats">
            <Box className="dash-stat" style={{ padding: 16 }}>
              <strong>{stats ? stats.callsAnswered : "—"}</strong>
              <span>Calls answered</span>
              <small>Agent picked up every one</small>
            </Box>
            <Box className="dash-stat" style={{ padding: 16 }}>
              <strong>{stats ? stats.completedCalls : "—"}</strong>
              <span>Completed</span>
              <small>Ran to the end of the call</small>
            </Box>
            <Box className="dash-stat" style={{ padding: 16 }}>
              <strong>{stats ? Math.round(stats.totalSeconds / 60) : "—"}</strong>
              <span>Minutes used</span>
              <small>Across every call</small>
            </Box>
            <Box className="dash-stat" style={{ padding: 16 }}>
              <strong>{stats ? formatCallLength(stats.averageSeconds) : "—"}</strong>
              <span>Average length</span>
              <small>From connect to finish</small>
            </Box>
          </div>

          <div className="dash-surfaces" style={{ marginTop: 16 }}>
            <Box className="dash-surface" style={{ padding: 20 }}>
              <p className="eyebrow">When people call</p>
              <h2>Hourly pattern</h2>
              <div className="dash-bars" aria-label="Hourly call volume">
                {hourly.map((h, i) => {
                  const hour = 8 + i;
                  return (
                    <div key={i} className="dash-bar">
                      <div className="dash-bar__track">
                        <div
                          className="dash-bar__fill"
                          style={{ height: `${(h / hourlyMax) * 100}%` }}
                        />
                      </div>
                      <span>{hour}:00</span>
                    </div>
                  );
                })}
              </div>
              <p className="dash-insight">
                {stats && stats.callsAnswered > 0
                  ? "Calls between 8am and 8pm in your business timezone."
                  : "No calls in this period yet."}
              </p>
            </Box>

            <Box className="dash-surface" style={{ padding: 20 }}>
              <p className="eyebrow">How calls ended</p>
              <h2>Outcomes</h2>
              <div className="dash-topics">
                {(() => {
                  const counts = new Map<string, number>();
                  for (const run of stats?.recent ?? []) {
                    const key = run.completed
                      ? dispositionText(run.disposition)
                      : "In progress";
                    counts.set(key, (counts.get(key) ?? 0) + 1);
                  }
                  const total = stats?.recent.length ?? 0;
                  if (total === 0) {
                    return <p>No calls in this period yet.</p>;
                  }
                  return [...counts.entries()].map(([label, count]) => {
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={label} className="dash-topic">
                        <span>{label}</span>
                        <div className="dash-topic__track">
                          <div
                            className="dash-topic__fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span>{pct}%</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </Box>

            <Box className="dash-surface" style={{ padding: 20 }}>
              <p className="eyebrow">Live</p>
              <h2>Answering</h2>
              <p className="dash-live-line">
                <PhoneIcon size={16} /> 0113 496 2288
              </p>
              <p className="dash-live-line">
                <ChatIcon size={16} /> Website button is on
              </p>
              <div className="stack-row" style={{ marginTop: 10 }}>
                <a className="ui-button" href={`/app/${business.slug}/conversations`}>
                  Test call
                </a>
                <DemoLink className="ui-button">Hear it now</DemoLink>
              </div>
            </Box>
          </div>

          <div className="dash-surfaces dash-surfaces--secondary">
            <Box className="dash-surface" style={{ padding: 20 }}>
              <div className="account-section__heading">
                <div>
                  <p className="eyebrow">Promises to keep</p>
                  <h2>People waiting on a call back</h2>
                </div>
                <Pill variant="warn">{callbackQueue.length}</Pill>
              </div>
              {callbackQueue.length === 0 ? (
                <p>No callbacks queued.</p>
              ) : (
                <div className="session-list" style={{ marginTop: 12 }}>
                  {callbackQueue.map((item) => (
                    <a
                      key={item.id}
                      className="session-item"
                      href={`/app/${business.slug}/callbacks`}
                    >
                      <div>
                        <strong>{item.contactName}</strong>
                        <span>
                          Due {formatDate(item.promisedAt)}
                          {item.reason ? ` · ${item.reason}` : ""}
                        </span>
                      </div>
                      <Pill variant="info">Open</Pill>
                    </a>
                  ))}
                </div>
              )}
            </Box>

            <Box className="dash-surface" style={{ padding: 20 }}>
              <div className="account-section__heading">
                <div>
                  <p className="eyebrow">Teach the agent</p>
                  <h2>Asked, and Robin had nothing</h2>
                </div>
                <Pill variant="warn">{gaps.length}</Pill>
              </div>
              {gaps.length === 0 ? (
                <p>No gaps recorded.</p>
              ) : (
                <div className="session-list" style={{ marginTop: 12 }}>
                  {gaps.map((gap) => (
                    <div className="session-item" key={gap.id}>
                      <div>
                        <strong>{gap.question}</strong>
                        <span>
                          Heard {gap.askCount} time{gap.askCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="stack-row">
                        <a
                          className="ui-button"
                          href={`/app/${business.slug}/settings/knowledge#gaps`}
                        >
                          Teach
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Box>

            <Box className="dash-surface" style={{ padding: 20 }}>
              <div className="account-section__heading">
                <div>
                  <p className="eyebrow">Today in the diary</p>
                  <h2>Bookings</h2>
                </div>
                <a className="ui-button" href={`/app/${business.slug}/bookings`}>
                  Open diary
                </a>
              </div>
              {diary.length === 0 ? (
                <p>Nothing in the diary today.</p>
              ) : (
                diary.map((slot) => (
                  <div className="ops-row" key={slot.id}>
                    <div className="ops-row__time">
                      <span>
                        {new Date(slot.startAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="ops-row__body">
                      <span className="ops-row__title">
                        {slot.customerName || slot.title}
                      </span>
                      <span className="ops-row__meta">
                        {slot.title}
                        {slot.source === "agent" ? " — booked by the agent" : ""}
                      </span>
                    </div>
                    {slot.status === "arrived" ? (
                      <Pill variant="good">Arrived</Pill>
                    ) : slot.status === "no_show" ? (
                      <Pill variant="warn">No-show</Pill>
                    ) : (
                      <Pill variant="info">Booked</Pill>
                    )}
                  </div>
                ))
              )}
            </Box>
          </div>

          <Box style={{ padding: 20, marginTop: 16 }}>
            <div className="account-section__heading">
              <div>
                <p className="eyebrow">Latest calls</p>
                <h2>Activity feed</h2>
              </div>
              <a
                className="ui-button"
                href={`/app/${business.slug}/conversations`}
              >
                All conversations
              </a>
            </div>
            {stats && stats.recent.length > 0 ? (
              <ul className="dash-activity">
                {stats.recent.map((run) => (
                  <li key={run.id}>
                    Call #{run.id} · {formatDate(run.startedAt)} ·{" "}
                    {run.completed ? dispositionText(run.disposition) : "In progress"}
                    {run.durationSeconds !== null
                      ? ` · ${formatCallLength(run.durationSeconds)}`
                      : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No calls in this period yet.</p>
            )}
          </Box>
        </>
      )}
    </WorkspaceShell>
  );
}

const sampleInvoices = [
  { when: "12 Jul", what: "Practice · July", amount: "£85.00" },
  { when: "12 Jun", what: "Practice · June", amount: "£81.00" },
  { when: "12 May", what: "Practice · May, 190 extra minutes", amount: "£92.40" },
];

function BillingPreview() {
  const minutes = 742;
  const minutesCap = 1200;

  return (
    <section className="account-section">
      <div className="account-section__heading">
        <div>
          <h2>Plan &amp; billing</h2>
          <p>Only an Owner can change the plan, the card, or who owns the workspace.</p>
        </div>
      </div>
      <Alert variant="info" title="Design preview">
        Billing goes live once the payments backend lands. Everything below is
        sample data.
      </Alert>
      <div className="dash-surfaces">
        <Box className="dash-surface" style={{ padding: 20 }}>
          <p className="eyebrow">Minutes used</p>
          <h2>
            {minutes} / {minutesCap} minutes
          </h2>
          <p>Cycle resets 12 Aug. Extra minutes are £0.045 each.</p>
          <div className="billing-progress" aria-label="Minutes used">
            <div
              className="billing-progress__bar"
              style={{ width: `${(minutes / minutesCap) * 100}%` }}
            />
          </div>
        </Box>
        <Box className="dash-surface" style={{ padding: 20 }}>
          <p className="eyebrow">Your plan</p>
          <h2>Practice · £79 a month</h2>
          <p>1,200 answered minutes, 8 seats, 2 numbers included. Renews 12 Aug.</p>
          <div className="stack-row">
            <Button variant="ghost" disabled>
              Change plan
            </Button>
            <Button variant="ghost" className="billing-cancel" disabled>
              Cancel plan
            </Button>
          </div>
        </Box>
        <Box className="dash-surface" style={{ padding: 20 }}>
          <p className="eyebrow">Phone numbers</p>
          <h2>Two included</h2>
          <p>0113 496 2288 · 020 7946 0822</p>
          <p>Then £3 each a month. Numbers are answered by the agent, all hours.</p>
          <div className="stack-row">
            <Button variant="ghost" disabled>
              Add a number
            </Button>
          </div>
        </Box>
      </div>
      <Box style={{ padding: 20 }}>
        <div className="account-section__heading">
          <div>
            <h2>Next invoice</h2>
            <p>12 Aug · estimated £79.00</p>
          </div>
        </div>
        <div className="session-list">
          {sampleInvoices.map((invoice) => (
            <div className="session-item" key={invoice.when}>
              <div>
                <strong>{invoice.what}</strong>
                <span>{invoice.when}</span>
              </div>
              <div className="stack-row">
                <Pill variant="good">Paid</Pill>
                <span>{invoice.amount}</span>
              </div>
            </div>
          ))}
        </div>
      </Box>
    </section>
  );
}

export function WorkspaceAccountPage() {
  return (
    <WorkspaceShell>
      {(business) => (
        <>
          <AccountContent />
          {can(business.role, "billing.access") ? <BillingPreview /> : null}
        </>
      )}
    </WorkspaceShell>
  );
}

export function TeamPage() {
  const slug = useBusinessSlug();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [escalations, setEscalations] = useState<Record<string, boolean>>({});
  const [nights, setNights] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const team = await api.businesses.team(slug);
      setMembers(team.members);
      setInvitations(team.invitations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load team.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const e: Record<string, boolean> = {};
    const n: Record<string, boolean> = {};
    for (const member of members) {
      e[member.userId] = member.role !== "Viewer";
      n[member.userId] = member.role === "Owner" || member.role === "Admin";
    }
    setEscalations(e);
    setNights(n);
  }, [members]);

  async function updateRole(userId: string, role: Role) {
    setError(null);
    try {
      await api.businesses.updateMemberRole(slug, userId, role);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to update this role.",
      );
    }
  }

  async function removeMember(userId: string) {
    setError(null);
    try {
      await api.businesses.removeMember(slug, userId);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to remove this member.",
      );
    }
  }

  async function revokeInvitation(invitationId: string) {
    setError(null);
    try {
      await api.businesses.revokeInvitation(slug, invitationId);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to revoke this invitation.",
      );
    }
  }

  async function resendInvitation(invitationId: string) {
    setError(null);
    try {
      const result = await api.businesses.resendInvitation(slug, invitationId);
      setPreviewUrl(result.previewUrl);
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to resend this invitation.",
      );
    }
  }

  return (
    <WorkspaceShell requiredPermission="team.manage">
      {(business) => (
        <>
          <div className="account-heading">
            <div>
              <p className="eyebrow">Team</p>
              <h2>{business.name} members</h2>
            </div>
            <Button variant="primary" onClick={() => setInviteOpen(true)}>
              Invite member
            </Button>
          </div>
          {error ? <Alert variant="error">{error}</Alert> : null}
          {previewUrl ? (
            <Alert variant="warn">
              Email delivery is disabled locally.{" "}
              <a href={previewUrl}>Open the latest invite preview.</a>
            </Alert>
          ) : null}
          {loading ? (
            <LoadingState label="Loading team…" />
          ) : (
            <>
              {Object.values(nights).length > 0 && !Object.values(nights).some(Boolean) ? (
                <Alert variant="warn" title="Nobody on nights">
                  Add at least one person to the night chain so urgent calls can
                  be escalated after hours.
                </Alert>
              ) : null}
              <Box style={{ padding: 0, overflow: "hidden" }}>
                <div className="data-table data-table--team">
                  <div className="data-table__row data-table__row--head data-table__row--team">
                    <span>Person</span>
                    <span>Role</span>
                    <span>Escalations</span>
                    <span>Nights</span>
                    <span>Seen</span>
                    <span>Actions</span>
                  </div>
                  {members.map((member) => (
                    <div className="data-table__row data-table__row--team" key={member.userId}>
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </span>
                      {business.role === "Owner" ||
                      (member.role !== "Owner" && member.role !== "Admin") ? (
                        <SelectField
                          aria-label={`Role for ${member.email}`}
                          value={member.role}
                          options={(business.role === "Owner"
                            ? roles
                            : roles.filter(
                                (role) =>
                                  role !== "Owner" && role !== "Admin",
                              )
                          ).map((role) => ({
                            label: role,
                            value: role,
                          }))}
                          onChange={(event) =>
                            void updateRole(
                              member.userId,
                              event.target.value as Role,
                            )
                          }
                        />
                      ) : (
                        <Pill>{member.role}</Pill>
                      )}
                      <span>
                        <Button
                          variant={escalations[member.userId] ? "primary" : "ghost"}
                          onClick={() =>
                            setEscalations((prev) => ({
                              ...prev,
                              [member.userId]: !prev[member.userId],
                            }))
                          }
                        >
                          {escalations[member.userId] ? "On" : "Off"}
                        </Button>
                      </span>
                      <span>
                        <Button
                          variant={nights[member.userId] ? "primary" : "ghost"}
                          onClick={() =>
                            setNights((prev) => ({
                              ...prev,
                              [member.userId]: !prev[member.userId],
                            }))
                          }
                        >
                          {nights[member.userId] ? "On" : "Off"}
                        </Button>
                      </span>
                      <span>{formatDate(new Date().toISOString())}</span>
                      {business.role === "Owner" ||
                      (member.role !== "Owner" && member.role !== "Admin") ? (
                        <Button
                          variant="ghost"
                          onClick={() => void removeMember(member.userId)}
                        >
                          Revoke
                        </Button>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  ))}
                </div>
              </Box>
              {business.role === "Owner" ? (
                <Box style={{ padding: 20, marginTop: 16 }}>
                  <div className="account-section__heading">
                    <div>
                      <h2>Ownership</h2>
                      <p>Transfer ownership to another active member.</p>
                    </div>
                    <Button variant="ghost" disabled>
                      Transfer ownership
                    </Button>
                  </div>
                </Box>
              ) : null}

              <section className="account-section">
                <div className="account-section__heading">
                  <div>
                    <h2>Pending invitations</h2>
                    <p>Invites expire after seven days and are email-bound.</p>
                  </div>
                  <Pill>{invitations.length}</Pill>
                </div>
                {invitations.length === 0 ? (
                  <EmptyState title="Nothing outstanding">
                    Everyone invited has joined.
                  </EmptyState>
                ) : (
                  <div className="session-list">
                    {invitations.map((invitation) => (
                      <div className="session-item" key={invitation.id}>
                        <div>
                          <strong>{invitation.email}</strong>
                          <span>
                            {invitation.role} · expires{" "}
                            {formatDate(invitation.expiresAt)}
                          </span>
                        </div>
                        <div className="stack-row">
                          <Button
                            variant="ghost"
                            onClick={() => void resendInvitation(invitation.id)}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => void revokeInvitation(invitation.id)}
                          >
                            Revoke
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
          <section className="account-section">
            <div className="account-section__heading">
              <div>
                <h2>What each role may do</h2>
                <p>
                  A role decides what someone can change — not what wakes them
                  up.
                </p>
              </div>
            </div>
            <Box style={{ padding: 0, overflow: "hidden" }}>
              <div className="data-table">
                <div className="data-table__row data-table__row--roles data-table__row--head">
                  <span>Permission</span>
                  {roles.map((role) => (
                    <span key={role}>{role}</span>
                  ))}
                </div>
                {permissionRows.map((row) => (
                  <div
                    className="data-table__row data-table__row--roles"
                    key={row.permission}
                  >
                    <span>{row.label}</span>
                    {roles.map((role) => (
                      <span key={role}>{can(role, row.permission) ? "✓" : "—"}</span>
                    ))}
                  </div>
                ))}
              </div>
            </Box>
          </section>
          <InviteMemberModal
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            onCreated={async (url) => {
              setPreviewUrl(url);
              setInviteOpen(false);
              await refresh();
            }}
            roles={
              business.role === "Owner"
                ? roles
                : roles.filter((role) => role !== "Owner" && role !== "Admin")
            }
            slug={slug}
          />
        </>
      )}
    </WorkspaceShell>
  );
}

function InviteMemberModal({
  onClose,
  onCreated,
  open,
  roles,
  slug,
}: {
  onClose: () => void;
  onCreated: (previewUrl: string | null) => Promise<void>;
  open: boolean;
  roles: Role[];
  slug: string;
}) {
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "Staff" },
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal open={open} onClose={onClose} titleId="invite-member-title">
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          try {
            const result = await api.businesses.invite(slug, values);
            await onCreated(result.invitation.previewUrl);
            form.reset();
          } catch (caught) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Unable to send this invitation.",
            );
          }
        })}
      >
        <h2 id="invite-member-title">Invite a teammate</h2>
        <TextField
          label="Email"
          type="email"
          error={form.formState.errors.email?.message}
          required
          {...form.register("email")}
        />
        <SelectField
          label="Role"
          error={form.formState.errors.role?.message}
          options={roles.map((role) => ({ label: role, value: role }))}
          {...form.register("role")}
        />
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="stack-row">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={form.formState.isSubmitting}
          >
            Send invite →
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function InvitationPage() {
  const auth = useAuth();
  const token = useToken();
  const [lookup, setLookup] = useState<Awaited<
    ReturnType<typeof api.invitations.get>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailMismatch, setEmailMismatch] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const redirect = encodeURIComponent(`/invite/${token}`);

  useEffect(() => {
    let cancelled = false;
    void api.invitations
      .get(token)
      .then((result) => {
        if (!cancelled) setLookup(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLookup({ state: "invalid" });
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load this invitation.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function acceptInvitation() {
    setAccepting(true);
    setError(null);
    setEmailMismatch(false);
    try {
      const result = await api.invitations.accept(token);
      window.location.replace(`/app/${result.businessSlug}/dashboard`);
    } catch (caught) {
      setEmailMismatch(
        caught instanceof ApiClientError &&
          caught.code === "INVITATION_EMAIL_MISMATCH",
      );
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to accept this invitation.",
      );
      setAccepting(false);
    }
  }

  if (!lookup || auth.status === "loading") {
    return <LoadingState label="Loading invitation…" />;
  }

  const invitation = lookup.invitation;
  const stateCopy: Record<typeof lookup.state, { title: string; body: string }> = {
    invalid: {
      title: "Invalid invitation",
      body: "This invitation link is invalid or no longer exists.",
    },
    expired: {
      title: "Invitation expired",
      body: "Ask the workspace owner to resend your invitation.",
    },
    revoked: {
      title: "Invitation revoked",
      body: "This invitation was revoked by the workspace team.",
    },
    accepted: {
      title: "Invitation already accepted",
      body: "This invitation has already been used.",
    },
    valid: {
      title: `Join ${invitation?.businessName ?? "this workspace"}`,
      body: invitation
        ? `${invitation.inviterName} invited ${invitation.email} as ${invitation.role}.`
        : "This invitation is ready to accept.",
    },
  };

  return (
    <AuthShell width={520}>
      <div className="auth-header">
        <Link to="/" className="wordmark">
          vocalonix
        </Link>
      </div>
      <Box style={{ padding: 24, textAlign: "center" }}>
        <Pill variant={lookup.state === "valid" ? "accent" : "warn"}>
          {lookup.state}
        </Pill>
        <h1 className="account-title">{stateCopy[lookup.state].title}</h1>
        <p className="auth-card-copy">{stateCopy[lookup.state].body}</p>
        {invitation ? (
          <div className="invite-summary">
            <strong>{invitation.businessName}</strong>
            <span>Role · {invitation.role}</span>
            <span>Expires · {formatDate(invitation.expiresAt)}</span>
          </div>
        ) : null}
        {error ? (
          <Alert variant="error">
            {emailMismatch ? <strong>Email mismatch. </strong> : null}
            {error}
          </Alert>
        ) : null}
        {lookup.state === "valid" ? (
          auth.session ? (
            <Button
              variant="primary"
              className="full-width"
              loading={accepting}
              onClick={() => void acceptInvitation()}
            >
              Accept invitation →
            </Button>
          ) : (
            <div className="stack-row">
              <a
                className="ui-button ui-button--primary"
                href={`/login?redirect=${redirect}`}
              >
                Log in to accept
              </a>
              <a className="ui-button" href={`/signup?redirect=${redirect}`}>
                Create account
              </a>
            </div>
          )
        ) : (
          <Link className="ui-button full-width" to="/app">
            Return to Vocalonix
          </Link>
        )}
      </Box>
    </AuthShell>
  );
}
