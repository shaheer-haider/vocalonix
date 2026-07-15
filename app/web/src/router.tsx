import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import App, {
  AgentSettingsView,
  KnowledgeBase,
  TestAgent,
} from "./App";
import { api } from "./api";
import { DesignSystemPage } from "./routes/DesignSystem";
import {
  AccountPage,
  AppHomePage,
  SecurityPage,
} from "./routes/account";
import {
  LandingPage,
  LoginPage,
  MagicLinkPage,
  SignupPage,
  VerifyEmailPage,
} from "./routes/public";

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="route-message">
      <p className="eyebrow">Not found</p>
      <h1>This page does not exist</h1>
      <a className="button button--primary" href="/secret/test-agent">
        Open Test Agent
      </a>
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
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

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  beforeLoad: async ({ location }) => {
    const session = await api.auth.session();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AppHomePage,
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  beforeLoad: async ({ location }) => {
    const session = await api.auth.session();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AccountPage,
});

const securityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account/security",
  beforeLoad: async ({ location }) => {
    const session = await api.auth.session();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: SecurityPage,
});

const designSystemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/design-system",
  component: DesignSystemPage,
});

const secretRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/secret",
  component: App,
  notFoundComponent: () => (
    <section className="route-message">
      <p className="eyebrow">Not found</p>
      <h1>This page does not exist</h1>
      <a className="button button--primary" href="/secret/test-agent">
        Open Test Agent
      </a>
    </section>
  ),
});

const secretIndexRoute = createRoute({
  getParentRoute: () => secretRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/secret/test-agent" });
  },
});

const testAgentRoute = createRoute({
  getParentRoute: () => secretRoute,
  path: "/test-agent",
  component: TestAgent,
});

const knowledgeBaseRoute = createRoute({
  getParentRoute: () => secretRoute,
  path: "/knowledge-base",
  component: KnowledgeBase,
});

const agentSettingsRoute = createRoute({
  getParentRoute: () => secretRoute,
  path: "/agent-settings",
  component: AgentSettingsView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  signupRoute,
  magicLinkRoute,
  verifyEmailRoute,
  appRoute,
  accountRoute,
  securityRoute,
  designSystemRoute,
  secretRoute.addChildren([
    secretIndexRoute,
    testAgentRoute,
    knowledgeBaseRoute,
    agentSettingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});
