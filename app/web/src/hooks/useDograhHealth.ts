import { useEffect, useState } from "react";

import { api } from "../api";
import type { DograhHealth } from "../types";

/**
 * Shared across the hero, nav, footer and workspace sidebar, so this result decides
 * whether the demo — the product's main conversion path — is offered at all.
 *
 * The promise used to be cached unconditionally and never invalidated, so one
 * transient failure at first paint hid the demo link everywhere for the rest of
 * the session, silently and with no retry. Only successful results are cached now,
 * and a failed lookup is retried by the next mount.
 */
let healthPromise: Promise<DograhHealth> | null = null;

function loadHealth(): Promise<DograhHealth> {
  if (!healthPromise) {
    healthPromise = api.dograhHealth().catch((error: unknown) => {
      // Drop the rejected promise so the next caller retries rather than
      // replaying the same failure forever.
      healthPromise = null;
      throw error;
    });
  }
  return healthPromise;
}

export function useDograhHealth() {
  const [state, setState] = useState<{
    loading: boolean;
    data: DograhHealth | null;
    error: string | null;
  }>({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    loadHealth()
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ...state,
    turnEnabled: Boolean(state.data?.turnEnabled),
    isLoading: state.loading,
  };
}
