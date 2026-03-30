import type { VercelRequest, VercelResponse } from "@vercel/node";

type StyleKey = "xhs" | "douyin" | "wechat";
type FormatKey = "text" | "html";

function pickStyleLabel(style: unknown) {
  if (style === "douyin") return "抖音风";
  if (style === "wechat") return "微信公众号风";
  return "小红书风";
}

function fallbackText(params: {
  productName: string;
  sellingPoints: string;
  audience: string;
  styleLabel: string;
}) {
  return [
    `【${params.styleLabel}】${params.productName}推荐`,
    `目标人群：${params.audience}`,
    `核心卖点：${params.sellingPoints}`,
    "",
    "标题建议：",
    `1. ${params.productName}让效率翻倍`,
    `2. 3个理由爱上${params.productName}`,
    "",
    "正文示例：",
    `${params.productName}基于AI能力，针对${params.audience}提供${params.sellingPoints}，上手快、见效快。`,
    "#AI #效率 #好物推荐",
  ].join("\n");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const productName = String(body.productName ?? "产品");
  const sellingPoints = String(body.sellingPoints ?? "更智能/更高效");
  const audience = String(body.audience ?? "泛用户");
  const style = (body.style ?? "xhs") as StyleKey;
  const format = (body.format ?? "text") as FormatKey;

  const styleLabel = pickStyleLabel(style);
  const baseText = fallbackText({ productName, sellingPoints, audience, styleLabel });

  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
  const model = process.env.DASHSCOPE_CHAT_MODEL || "qwen-plus";
  const baseUrl = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";

  if (!apiKey) {
    const html = `<h3>${productName}推荐</h3><p>${baseText.split("\n").slice(1).join("<br/>")}</p>`;
    res.status(200).json({ text: baseText, html, used: format, provider: "fallback" });
    return;
  }

  try {
    const system = "你是一个擅长营销转化的中文内容创作助手。输出必须贴合用户输入，不要编造不存在的功能。";
    const user = [
      `请按${styleLabel}生成一条产品营销内容。`,
      `产品名称：${productName}`,
      `目标人群：${audience}`,
      `核心卖点：${sellingPoints}`,
      format === "html" ? "输出为简洁的HTML（仅使用h3/p/ul/li/br等基础标签）。" : "输出为纯文本，段落清晰。"
    ].join("\n");

    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.8,
      }),
    });

    const text = await r.text();
    type ChatCompletionResponse = { choices?: Array<{ message?: { content?: string } }> };
    let json: ChatCompletionResponse = {};
    try {
      json = JSON.parse(text) as ChatCompletionResponse;
    } catch {
      console.error("Parse copy error:", text);
    }
    const content = String(json.choices?.[0]?.message?.content ?? "").trim();
    if (!r.ok || !content) {
      const html = `<h3>${productName}推荐</h3><p>${baseText.split("\n").slice(1).join("<br/>")}</p>`;
      res.status(200).json({ text: baseText, html, used: format, provider: "fallback" });
      return;
    }

    if (format === "html") {
      res.status(200).json({ text: content, html: content, used: format, provider: "dashscope", model });
      return;
    }

    const html = `<h3>${productName}推荐</h3><p>${content.split("\n").join("<br/>")}</p>`;
    res.status(200).json({ text: content, html, used: format, provider: "dashscope", model });
  } catch {
    const html = `<h3>${productName}推荐</h3><p>${baseText.split("\n").slice(1).join("<br/>")}</p>`;
    res.status(200).json({ text: baseText, html, used: format, provider: "fallback" });
  }
}
