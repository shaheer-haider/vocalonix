import { describe, expect, it } from "bun:test";

import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  paginate,
  parseListQuery,
} from "./pagination";

describe("list pagination", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(parseListQuery({})).toEqual({
      limit: DEFAULT_LIST_LIMIT,
      offset: 0,
    });
    expect(parseListQuery({ limit: "abc", offset: "xyz" })).toEqual({
      limit: DEFAULT_LIST_LIMIT,
      offset: 0,
    });
  });

  it("clamps limit and offset to sane bounds", () => {
    expect(parseListQuery({ limit: "0", offset: "-5" })).toEqual({
      limit: 1,
      offset: 0,
    });
    expect(parseListQuery({ limit: "9999", offset: "10" })).toEqual({
      limit: MAX_LIST_LIMIT,
      offset: 10,
    });
    expect(parseListQuery({ limit: "25", offset: "50" })).toEqual({
      limit: 25,
      offset: 50,
    });
  });

  it("reports hasMore when an extra row was fetched", () => {
    expect(paginate([1, 2, 3], 2)).toEqual({ items: [1, 2], hasMore: true });
    expect(paginate([1, 2], 2)).toEqual({ items: [1, 2], hasMore: false });
  });
});
