import { describe, expect, it } from "vitest";

import { isAvatarVoiceEnabled, resolveAvatarVoiceIdForSubmit } from "@/components/video/avatarVoice";

describe("avatarVoice", () => {
  it("treats a selected Vidu voice as enabled even when the legacy checkbox is off", () => {
    expect(
      isAvatarVoiceEnabled({
        enableViduVoiceSelection: true,
        voiceId: "vidu-clone-voice",
        legacyTtsEnabled: false,
      })
    ).toBe(true);
  });

  it("does not submit a Vidu voice when the selection is blank", () => {
    expect(
      resolveAvatarVoiceIdForSubmit({
        enableViduVoiceSelection: true,
        voiceId: "   ",
        legacyTtsEnabled: true,
      })
    ).toBeUndefined();
  });

  it("keeps legacy checkbox behavior for non-Vidu voice inputs", () => {
    expect(
      resolveAvatarVoiceIdForSubmit({
        enableViduVoiceSelection: false,
        voiceId: "custom-voice-id",
        legacyTtsEnabled: false,
      })
    ).toBeUndefined();

    expect(
      resolveAvatarVoiceIdForSubmit({
        enableViduVoiceSelection: false,
        voiceId: "custom-voice-id",
        legacyTtsEnabled: true,
      })
    ).toBe("custom-voice-id");
  });
});
