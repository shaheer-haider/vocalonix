// Preview-only context for /design-sync cards. Never imported by the app.
//
// PublicNav/SideNav/OnboardingShell read @tanstack/react-router context, and
// PublicNav additionally reads AuthProvider. Without both, those cards throw
// instead of rendering. The route tree below mirrors only the paths the shell
// components link to.
import { createContext, useContext, type ReactNode } from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { AuthProvider } from "../src/auth/AuthProvider";

// Cards render in a static page with no API behind them. Answer the two
// endpoints AuthProvider and useDograhHealth call on mount so the nav renders
// its real signed-out state instead of an error state, and so no card render
// depends on network timing.
const CANNED: Record<string, unknown> = {
  "/api/auth/session": { session: null },
  "/api/dograh/health": { turnEnabled: true },
};

if (typeof window !== "undefined" && !(window as any).__dsFetchPatched) {
  (window as any).__dsFetchPatched = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, window.location.origin).pathname;
    if (path in CANNED) {
      return Promise.resolve(
        new Response(JSON.stringify(CANNED[path]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    if (path.startsWith("/api/")) {
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof window.fetch;
}

// The card content has to render *through* the router, not merely beside it:
// RouterProvider is what populates router state, and Link/useLocation throw
// ("Could not find a nearest match!") without it. So the tree's route component
// re-reads the children handed to PreviewProvider.
const Children = createContext<ReactNode>(null);

const rootRoute = createRootRoute({ component: () => <>{useContext(Children)}</> });
const routes = ["/", "/demo", "/login", "/signup", "/app", "/app/$"].map((path) =>
  createRoute({ getParentRoute: () => rootRoute, path, component: () => <>{useContext(Children)}</> }),
);
const catchAll = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: () => <>{useContext(Children)}</>,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([...routes, catchAll]),
  history: createMemoryHistory({ initialEntries: ["/app/acme/conversations"] }),
  defaultPendingMs: 0,
});

export function PreviewProvider({ children }: { children: ReactNode }) {
  return (
    <Children.Provider value={children}>
      <AuthProvider>
        <RouterProvider router={router as never} />
      </AuthProvider>
    </Children.Provider>
  );
}
