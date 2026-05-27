// Find & Replace matching core (CLAUDE.md §8). The decoration plugin and the
// SearchBar UI are GUI (need the webview); `findInText` is the testable heart of
// the matching logic.
import { describe, expect, it } from "vitest";
import { findInText } from "../src/ui/search";

describe("findInText", () => {
  it("finds all non-overlapping occurrences", () => {
    expect(findInText("the cat sat on the mat", "at")).toEqual([5, 9, 20]);
  });
  it("is case-insensitive", () => {
    expect(findInText("Hello HELLO hello", "hello")).toEqual([0, 6, 12]);
  });
  it("returns an empty list for no match or empty needle", () => {
    expect(findInText("abc", "xyz")).toEqual([]);
    expect(findInText("abc", "")).toEqual([]);
  });
  it("does not overlap matches", () => {
    expect(findInText("aaaa", "aa")).toEqual([0, 2]);
  });
  it("matches the whole string", () => {
    expect(findInText("word", "word")).toEqual([0]);
  });
});
