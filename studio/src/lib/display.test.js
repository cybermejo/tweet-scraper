import { describe, it, expect } from "vitest";
import { capNotice, MAX_VISIBLE } from "./display.js";

describe("capNotice", () => {
  it("returns null when the match count is at or below the cap", () => {
    expect(capNotice(0, 500)).toBeNull();
    expect(capNotice(500, 500)).toBeNull();
  });

  it("returns a notice when matches exceed the cap", () => {
    expect(capNotice(501, 500)).toBe("Showing the top 500 of 501 matches");
  });

  it("formats large match counts with thousands separators", () => {
    expect(capNotice(12345, 500)).toBe("Showing the top 500 of 12,345 matches");
  });

  it("defaults to MAX_VISIBLE when no cap is passed", () => {
    expect(capNotice(MAX_VISIBLE)).toBeNull();
    expect(capNotice(MAX_VISIBLE + 1)).toBe(
      `Showing the top ${MAX_VISIBLE} of ${(MAX_VISIBLE + 1).toLocaleString()} matches`,
    );
  });
});
