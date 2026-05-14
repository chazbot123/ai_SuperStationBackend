export function isAvatarVoiceEnabled(input: {
  enableViduVoiceSelection?: boolean;
  voiceId?: string | null;
  legacyTtsEnabled?: boolean;
}) {
  if (input.enableViduVoiceSelection) {
    return String(input.voiceId ?? "").trim().length > 0;
  }
  return !!input.legacyTtsEnabled;
}

export function resolveAvatarVoiceIdForSubmit(input: {
  enableViduVoiceSelection?: boolean;
  voiceId?: string | null;
  legacyTtsEnabled?: boolean;
}) {
  const trimmed = String(input.voiceId ?? "").trim();
  if (!trimmed) return undefined;
  return isAvatarVoiceEnabled(input) ? trimmed : undefined;
}
