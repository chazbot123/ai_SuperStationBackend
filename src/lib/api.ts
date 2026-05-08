type ErrorPayload = {
  message?: string | string[];
  error?: unknown;
  error_msg?: unknown;
  msg?: unknown;
  raw?: unknown;
};

function resolveErrorMessage(data: unknown, fallbackText?: string, status?: number) {
  if (data && typeof data === "object") {
    const payload = data as ErrorPayload & Record<string, unknown>;
    const message = payload.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
    if (Array.isArray(message)) {
      const joinedMessage = message
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .join("；");
      if (joinedMessage) {
        return joinedMessage;
      }
    }

    const otherCandidates = [
      payload.error_msg,
      payload.msg,
      typeof payload.error === "object" && payload.error && "message" in (payload.error as any)
        ? (payload.error as any).message
        : payload.error,
      payload.raw,
    ];
    for (const candidate of otherCandidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
  }

  const raw = String(fallbackText ?? "").trim();
  const rawLower = raw.toLowerCase();
  if (
    rawLower.includes("econnrefused") ||
    rawLower.includes("proxy error") ||
    rawLower.includes("localhost:3000") ||
    rawLower.includes("127.0.0.1:3000")
  ) {
    return "网络错误：无法连接到后端接口（/api）。请确认后端服务已启动且可访问（默认 http://localhost:3000）。";
  }
  if (raw) {
    return raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
  }

  return status ? `请求失败（${status}）` : "请求失败";
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Failed to fetch") {
      throw new Error("网络错误：无法连接到后端接口（/api）。请确认后端服务已启动且可访问（默认 http://localhost:3000）。");
    }
    throw new Error(message || "网络错误：请求失败");
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      unauthorizedHandler?.();
      throw new Error("登录已过期，请重新登录");
    }
    throw new Error(resolveErrorMessage(data, text, response.status));
  }

  return data as T;
}
