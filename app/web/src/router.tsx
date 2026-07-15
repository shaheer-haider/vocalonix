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
import { DesignSystemPage } from "./routes/DesignSystem";
import { LandingPage, LoginPage, SignupPage } from "./routes/public";

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
