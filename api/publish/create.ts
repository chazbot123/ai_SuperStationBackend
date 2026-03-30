import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  const { title = "未命名内容", channel = "小红书", scheduledAt = null } = req.body || {};
  const id = `job_${Date.now()}`;
  res.status(200).json({ id, title, channel, scheduledAt, status: "queued" });
}
