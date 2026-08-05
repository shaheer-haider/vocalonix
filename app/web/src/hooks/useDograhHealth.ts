import { useEffect, useState } from "react";

import { api } from "../api";
import type { DograhHealth } from "../types";

let healthPromise: Promise<DograhHealth> | null = null;

export function useDograhHealth() {
  const [state, setState] = useState<{
    loading: boolean;
    data: DograhHealth | null;
    error: string | null;
  }>({ loading: true, data: null, error: null });

  useEffect(() => {
    if (!healthPromise) {
      healthPromise = api.dograhHealth();
    }

    healthPromise
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((err) =>
        setState({
          loading: false,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
  }, []);

  return {
    ...state,
    turnEnabled: Boolean(state.data?.turnEnabled),
    isLoading: state.loading,
  };
}
