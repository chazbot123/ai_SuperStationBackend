const DEFAULT_LOCAL_AGENT_BASE_URL = "http://127.0.0.1:3210";

export const LOCAL_AGENT_BASE_URL = (
  import.meta.env.VITE_LOCAL_AGENT_BASE_URL || DEFAULT_LOCAL_AGENT_BASE_URL
).trim();

export type LocalAgentStatus = {
  configPath: string;
  localDataRoot: string;
  bitBrowserPath: string | null;
  bitBrowserExists: boolean;
  extensionSourceDir: string;
  extensionSourceExists: boolean;
  extensionTargetDir: string;
  extensionTargetExists: boolean;
  serverEnvPath: string;
  serverEnvExists: boolean;
  localApiBaseUrl: string | null;
  config: Record<string, unknown>;
};

async function requestLocalAgent<T>(pathname: string, init?: RequestInit) {
  const response = await fetch(`${LOCAL_AGENT_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `本地客户端请求失败: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function pingLocalAgent() {
  try {
    const result = await requestLocalAgent<{ status: string }>("/health", {
      method: "GET",
    });
    return result.status === "ok";
  } catch {
    return false;
  }
}

export async function getLocalAgentStatus() {
  return requestLocalAgent<LocalAgentStatus>("/status", {
    method: "GET",
  });
}

export async function startLocalAgentBitBrowser() {
  return requestLocalAgent<{
    command: "start-bitbrowser";
    bitBrowserPath: string;
    launchArgs: string[];
  }>("/start-bitbrowser", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
