type ErrorPayload = {
  message?: string | string[];
};

function resolveErrorMessage(data: unknown) {
  if (!data || typeof data !== "object" || !("message" in data)) {
    return "请求失败";
  }

  const message = (data as ErrorPayload).message;
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

  return "请求失败";
}

export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T | ErrorPayload) : null;

  if (!response.ok) {
    throw new Error(resolveErrorMessage(data));
  }

  return data as T;
}
