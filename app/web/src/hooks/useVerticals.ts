import { useEffect, useState } from "react";

import { api } from "../api";
import type { Vertical } from "../types";

/**
 * The trade catalogue, shared by the demo funnel, workspace creation and
 * business settings.
 *
 * These slugs are not cosmetic: the workflow generator looks up trade-specific
 * agent rules by slug (what the agent must never advise on, what counts as an
 * emergency). A business saved under a label that is not in this list simply
 * gets no trade rules, so all three surfaces have to offer the same options.
 */
export function useVerticals(): { verticals: Vertical[]; loading: boolean } {
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .verticals()
      .then((result) => {
        if (!cancelled) setVerticals(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { verticals, loading };
}

export function verticalOptions(
  verticals: Vertical[],
  saved?: string | null,
): { label: string; value: string }[] {
  const options = verticals.map((vertical) => ({
    label: vertical.label,
    value: vertical.slug,
  }));
  // A business saved before this list existed keeps its own value visible
  // rather than silently switching trade on the next save.
  if (saved && !options.some((option) => option.value === saved)) {
    return [{ label: saved, value: saved }, ...options];
  }
  return options;
}
