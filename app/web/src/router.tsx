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
  beforeLoad: () => {
    throw redirect({ to: "/secret/test-agent" });
  },
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
