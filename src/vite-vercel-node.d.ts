declare module "@vercel/node" {
  export interface VercelRequest {
    method?: string;
    body?: unknown;
    query?: Record<string, string | string[] | undefined>;
    headers: Record<string, string | string[] | undefined>;
  }

  export interface VercelResponse {
    status(code: number): VercelResponse;
    json(body: unknown): void;
    send(body: unknown): void;
    setHeader(name: string, value: string | readonly string[]): void;
  }
}
