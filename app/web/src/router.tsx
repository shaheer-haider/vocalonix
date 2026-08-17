import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { loadSession } from "./auth/session";
import { LoadingState } from "./components/ui";
import { RouteError, RouteNotFound } from "./components/shell/RouteError";
// Public entry points stay in the initial chunk: they are the first paint.
import {
  LandingPage,
  LoginPage,
  MagicLinkPage,
  SignupPage,
  VerifyEmailPage,
} from "./routes/public";
// Pricing is a marketing page a visitor reaches before signing up, so it shares
// the public chunk rather than costing a lazy round trip on first paint.
import { PricingPage } from "./routes/pricing";

/**
 * Everything behind auth is split out. Previously a visitor landing on the
 * marketing page downloaded the whole workspace app — tenant settings, the
 * bookings diary, contacts — in one 596 kB chunk before the hero painted.
 */
const lazyPage = <
  TModule extends Record<string, unknown>,
  TKey extends keyof TModule & string,
>(
  loader: () => Promise<TModule>,
  exportName: TKey,
) => lazyRouteComponent(loader, exportName);

const DesignSystemPage = lazyPage(() => import("./routes/DesignSystem"), "DesignSystemPage");
const AccountPage = lazyPage(() => import("./routes/account"), "AccountPage");
const AppHomePage = lazyPage(() => import("./routes/account"), "AppHomePage");
const SecurityPage = lazyPage(() => import("./routes/account"), "SecurityPage");
const CreateBusinessPage = lazyPage(() => import("./routes/business"), "CreateBusinessPage");
const InvitationPage = lazyPage(() => import("./routes/business"), "InvitationPage");
const TeamPage = lazyPage(() => import("./routes/business"), "TeamPage");
const WorkspaceAccountPage = lazyPage(() => import("./routes/business"), "WorkspaceAccountPage");
const WorkspaceDashboardPage = lazyPage(() => import("./routes/business"), "WorkspaceDashboardPage");
const WorkspaceContactsPage = lazyPage(() => import("./routes/contacts"), "WorkspaceContactsPage");
const WorkspaceConversationsPage = lazyPage(() => import("./routes/conversations"), "WorkspaceConversationsPage");
const WorkspaceBookingsPage = lazyPage(() => import("./routes/operations"), "WorkspaceBookingsPage");
const WorkspaceCallbacksPage = lazyPage(() => import("./routes/operations"), "WorkspaceCallbacksPage");
const WorkspaceNotificationsPage = lazyPage(() => import("./routes/notifications"), "WorkspaceNotificationsPage");
const TenantOnboardingPage = lazyPage(() => import("./routes/tenant"), "TenantOnboardingPage");
const TenantSettingsPage = lazyPage(() => import("./routes/tenant"), "TenantSettingsPage");
const DemoPage = lazyPage(() => import("./routes/demo"), "DemoPage");

/**
 * Shared by every guarded route. `loadSession` is cached, so this costs a
 * network round trip once rather than once per navigation — and no longer
 * races `AuthProvider` to make the same request twice on first paint.
 */
const requireSession = async ({ location }: { location: { href: string } }) => {
  if (!(await loadSession())) {
    throw redirect({ to: "/login", search: { redirect: location.href } });
  }
};

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: RouteNotFound,
  errorComponent: RouteError,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const demoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/demo",
  component: DemoPage,
});

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pricing",
  component: PricingPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  component: SignupPage,
});

const magicLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/magic",
  component: MagicLinkPage,
});

const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email",
  component: VerifyEmailPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: InvitationPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  beforeLoad: requireSession,
  component: AppHomePage,
});

const createBusinessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/onboarding/create",
  beforeLoad: requireSession,
  component: CreateBusinessPage,
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/$businessSlug",
  beforeLoad: requireSession,
  component: Outlet,
});

const workspaceIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/$businessSlug/dashboard",
      params: { businessSlug: params.businessSlug },
    });
  },
});

const workspaceDashboardRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/dashboard",
  component: WorkspaceDashboardPage,
});

const workspaceConversationsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/conversations",
  component: WorkspaceConversationsPage,
});

const workspaceContactsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/contacts",
  component: WorkspaceContactsPage,
});

const workspaceBookingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/bookings",
  component: WorkspaceBookingsPage,
});

const workspaceCallbacksRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/callbacks",
  component: WorkspaceCallbacksPage,
});

const workspaceNotificationsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/notifications",
  component: WorkspaceNotificationsPage,
});

const workspaceTeamRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/team",
  component: TeamPage,
});

const workspaceAccountRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/account",
  component: WorkspaceAccountPage,
});

const workspaceOnboardingRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/onboarding/$step",
  component: TenantOnboardingPage,
});

const workspaceSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings",
  component: TenantSettingsPage,
});

const workspaceProfileSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/profile",
  component: () => <TenantSettingsPage section="business" />,
});

const workspaceBusinessSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/business",
  component: () => <TenantSettingsPage section="business" />,
});

const workspaceAppearanceSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/appearance",
  component: () => <TenantSettingsPage section="appearance" />,
});

const workspaceHistorySettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/history",
  component: () => <TenantSettingsPage section="history" />,
});

const workspaceAgentSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/agent",
  component: () => <TenantSettingsPage section="agent" />,
});

const workspaceKnowledgeSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/knowledge",
  component: () => <TenantSettingsPage section="knowledge" />,
});

const workspaceHoursSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/hours",
  component: () => <TenantSettingsPage section="hours" />,
});

const workspacePhoneSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/phone",
  component: () => <TenantSettingsPage section="phone" />,
});

const workspaceWidgetSettingsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/settings/widget",
  component: () => <TenantSettingsPage section="widget" />,
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  beforeLoad: requireSession,
  component: AccountPage,
});

const securityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account/security",
  beforeLoad: requireSession,
  component: SecurityPage,
});

const designSystemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/design-system",
  component: DesignSystemPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  demoRoute,
  pricingRoute,
  loginRoute,
  signupRoute,
  magicLinkRoute,
  verifyEmailRoute,
  inviteRoute,
  appRoute,
  createBusinessRoute,
  workspaceRoute.addChildren([
    workspaceIndexRoute,
    workspaceDashboardRoute,
    workspaceConversationsRoute,
    workspaceContactsRoute,
    workspaceBookingsRoute,
    workspaceCallbacksRoute,
    workspaceNotificationsRoute,
    workspaceTeamRoute,
    workspaceAccountRoute,
    workspaceOnboardingRoute,
    workspaceSettingsRoute,
    workspaceProfileSettingsRoute,
    workspaceBusinessSettingsRoute,
    workspaceAppearanceSettingsRoute,
    workspaceHistorySettingsRoute,
    workspaceAgentSettingsRoute,
    workspaceKnowledgeSettingsRoute,
    workspaceHoursSettingsRoute,
    workspacePhoneSettingsRoute,
    workspaceWidgetSettingsRoute,
  ]),
  accountRoute,
  securityRoute,
  designSystemRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
  defaultPendingComponent: () => <LoadingState label="Loading…" />,
});

/**
 * Every route rendered the same "Harkbell" title, which makes browser history and
 * multi-tab use ambiguous. Titles are derived from the matched path.
 */
const ROUTE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, "Harkbell — never lose another booking to a missed call"],
  [/^\/demo/, "Hear it now"],
  [/^\/pricing/, "Pricing"],
  [/^\/login/, "Log in"],
  [/^\/signup/, "Create your account"],
  [/^\/magic/, "Check your email"],
  [/^\/verify-email/, "Verify your email"],
  [/^\/invite\//, "You've been invited"],
  [/^\/design-system/, "Design system"],
  [/^\/account\/security/, "Security"],
  [/^\/account/, "Account"],
  [/\/settings\/knowledge/, "Knowledge"],
  [/\/settings\/hours/, "Opening hours"],
  [/\/settings\/phone/, "Phone"],
  [/\/settings\/widget/, "Widget"],
  [/\/settings\/agent/, "Agent"],
  [/\/settings\/history/, "History"],
  [/\/settings/, "Settings"],
  [/\/onboarding/, "Set up your agent"],
  [/\/conversations/, "Conversations"],
  [/\/contacts/, "Contacts"],
  [/\/bookings/, "Bookings"],
  [/\/callbacks/, "Callbacks"],
  [/\/notifications/, "Notifications"],
  [/\/team/, "Team"],
  [/^\/app/, "Your workspaces"],
];

function titleFor(pathname: string) {
  const match = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname));
  if (!match) return "Harkbell";
  return match[1].startsWith("Harkbell") ? match[1] : `${match[1]} · Harkbell`;
}

router.subscribe("onResolved", () => {
  document.title = titleFor(router.state.location.pathname);
});
