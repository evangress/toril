// Status-bar counting helpers (CLAUDE.md §4). The DOM/editor wiring is GUI and
// needs the webview; these pure functions are the testable core.
import { describe, expect, it } from "vitest";
import { countCharacters, countWords, cursorLineColumn } from "../src/ui/statusbar";

describe("countWords", () => {
  it("counts runs of non-whitespace", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("  spaced   out  words ")).toBe(3);
    expect(countWords("one\ntwo\nthree")).toBe(3); // newlines separate too
  });
  it("is zero for empty or blank text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });
});

describe("countCharacters", () => {
  it("counts characters including spaces", () => {
    expect(countCharacters("hello")).toBe(5);
    expect(countCharacters("a b")).toBe(3);
    expect(countCharacters("")).toBe(0);
  });
  it("counts an emoji as a single character", () => {
    expect(countCharacters("🚀")).toBe(1);
    expect(countCharacters("hi🚀")).toBe(3);
  });
});

describe("cursorLineColumn", () => {
  it("is 1,1 at the start", () => {
    expect(cursorLineColumn("")).toEqual({ line: 1, column: 1 });
  });
  it("counts the column within the first line", () => {
    expect(cursorLineColumn("hello")).toEqual({ line: 1, column: 6 });
  });
  it("advances the line per block separator and resets the column", () => {
    expect(cursorLineColumn("first\nsec")).toEqual({ line: 2, column: 4 });
    expect(cursorLineColumn("a\nb\n")).toEqual({ line: 3, column: 1 });
  });
});
