type OpenExternalUrlResult = {
  ok: boolean;
  fallbackUsed: boolean;
};

type OpenExternalUrlDeps = {
  open?: (url?: string | URL, target?: string, features?: string) => Window | null;
  assign?: (url: string) => void;
};

export function openExternalUrl(
  url: string | null | undefined,
  deps: OpenExternalUrlDeps = {},
): OpenExternalUrlResult {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl) {
    return { ok: false, fallbackUsed: false };
  }

  const open = deps.open ?? window.open.bind(window);
  const assign = deps.assign ?? window.location.assign.bind(window.location);
  const popup = open(normalizedUrl, "_blank", "noopener,noreferrer");

  if (popup) {
    return { ok: true, fallbackUsed: false };
  }

  assign(normalizedUrl);
  return { ok: true, fallbackUsed: true };
}
