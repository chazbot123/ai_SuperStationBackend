import { describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "@/utils/openExternalUrl";

describe("openExternalUrl", () => {
  it("opens a new tab when the browser allows it", () => {
    const open = vi.fn().mockReturnValue({ focus: vi.fn() });
    const assign = vi.fn();

    const result = openExternalUrl("https://example.com/login", {
      open,
      assign,
    });

    expect(result).toEqual({ ok: true, fallbackUsed: false });
    expect(open).toHaveBeenCalledWith("https://example.com/login", "_blank", "noopener,noreferrer");
    expect(assign).not.toHaveBeenCalled();
  });

  it("falls back to same-tab navigation when popups are blocked", () => {
    const open = vi.fn().mockReturnValue(null);
    const assign = vi.fn();

    const result = openExternalUrl("https://example.com/login", {
      open,
      assign,
    });

    expect(result).toEqual({ ok: true, fallbackUsed: true });
    expect(assign).toHaveBeenCalledWith("https://example.com/login");
  });

  it("rejects blank urls", () => {
    const open = vi.fn();
    const assign = vi.fn();

    const result = openExternalUrl("   ", {
      open,
      assign,
    });

    expect(result).toEqual({ ok: false, fallbackUsed: false });
    expect(open).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
