import type { VercelRequest, VercelResponse } from "@vercel/node";

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgPlaceholderDataUri(label: string, w: number, h: number, index: number) {
  const title = escapeXml((label || "未命名产品").trim().slice(0, 24) || "未命名产品");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#1f2937"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect x="16" y="16" width="${w - 32}" height="${h - 32}" rx="16" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"/><text x="32" y="72" fill="#ffffff" font-size="28" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">AI 配图占位</text><text x="32" y="118" fill="rgba(255,255,255,0.9)" font-size="22" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">${title}</text><text x="32" y="156" fill="rgba(255,255,255,0.65)" font-size="16" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">图片生成服务不可用</text><text x="32" y="${h - 44}" fill="rgba(255,255,255,0.55)" font-size="14" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">#${index + 1}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function svgReferencePlaceholderDataUri(label: string, referenceImage: string, w: number, h: number, index: number) {
  const title = escapeXml((label || "未命名产品").trim().slice(0, 24) || "未命名产品");
  const safeRef = escapeXml(referenceImage);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#1f2937"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect x="20" y="20" width="${w - 40}" height="${h - 40}" rx="20" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)"/><image href="${safeRef}" x="44" y="96" width="${w - 88}" height="${Math.min(h - 208, 420)}" preserveAspectRatio="xMidYMid slice" clip-path="inset(0 round 16px)"/><text x="44" y="60" fill="#ffffff" font-size="28" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">参考图生成占位</text><text x="44" y="88" fill="rgba(255,255,255,0.78)" font-size="18" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">${title}</text><text x="44" y="${h - 74}" fill="rgba(255,255,255,0.72)" font-size="16" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">已读取客户上传图片作为参考图</text><text x="44" y="${h - 48}" fill="rgba(255,255,255,0.5)" font-size="14" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">#${index + 1}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function pickDimensions(sizePreset: string, resolution: string) {
  const factor = resolution === "4k" ? 2 : resolution === "2k" ? 1.5 : 1;
  const base =
    sizePreset === "1_1"
      ? [1024, 1024]
      : sizePreset === "4_5"
      ? [1080, 1350]
      : sizePreset === "9_16"
      ? [1080, 1920]
      : sizePreset === "16_9"
      ? [1920, 1080]
      : [1080, 1440];
  return [Math.round(base[0] * factor), Math.round(base[1] * factor)] as const;
}

function fallbackUrls(prompt: string, sizePreset: string, resolution: string, referenceImages?: string[]) {
  const [w, h] = pickDimensions(sizePreset, resolution);
  const refs = (referenceImages ?? []).filter(Boolean);
  if (refs.length > 0) {
    return Array.from({ length: 3 }).map((_, i) => svgReferencePlaceholderDataUri(prompt, refs[i % refs.length]!, w, h, i));
  }
  return Array.from({ length: 3 }).map((_, i) => svgPlaceholderDataUri(prompt, w, h, i));
}

async function fetchAsDataUrl(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "GET", signal: controller.signal });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    const mime = String(r.headers.get("content-type") || "image/jpeg");
    const b64 = Buffer.from(ab).toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function pickDashScopeSize(sizePreset: string, resolution: string) {
  const [w, h] = pickDimensions(sizePreset, resolution);
  return `${w}*${h}`;
}

function extractHttpUrls(input: unknown) {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown) => {
    if (!node) return;
    if (typeof node === "string") {
      if (node.startsWith("http://") || node.startsWith("https://")) {
        if (!seen.has(node)) {
          seen.add(node);
          out.push(node);
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const v of node) visit(v);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const direct = [obj.url, obj.image, obj.image_url, obj.imageUrl];
      for (const v of direct) visit(v);
      for (const v of Object.values(obj)) visit(v);
    }
  };
  visit(input);
  return out;
}

function isWan26Model(model: string) {
  const m = (model || "").toLowerCase();
  return m === "wan2.6-image" || m.startsWith("wan2.6-");
}

async function dashscopeWan26Generate(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  sizePreset: string;
  resolution: string;
  count: number;
}) {
  const { apiKey, model, prompt, sizePreset, resolution, count } = opts;
  // 阿里云模型要求 seed 不能超过 2147483647（Int32 范围）
  const seedBase = Math.floor(Math.random() * 2000000000);
  const preferredSize = pickDashScopeSize(sizePreset, resolution);
  const fallbackSizes = ["1024*1024", preferredSize].filter((v, i, a) => a.indexOf(v) === i);
  const urls: string[] = [];
  const debug: Array<{ ok: boolean; status?: number; data?: unknown }> = [];

  for (let i = 0; i < count; i++) {
    let last: { ok: boolean; status?: number; data?: unknown } | null = null;
    for (const size of fallbackSizes) {
      const attempts: Array<{ input: unknown; parameters: Record<string, unknown> }> = [
        {
          input: {
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: prompt }],
              },
            ],
          },
          parameters: { size, seed: seedBase + i },
        },
        {
          input: {
            messages: [
              {
                role: "user",
                content: [{ text: prompt }],
              },
            ],
          },
          parameters: { size, seed: seedBase + i },
        },
        {
          input: {
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          },
          parameters: { size, seed: seedBase + i },
        },
        {
          input: { prompt },
          parameters: { size, seed: seedBase + i },
        },
        {
          input: {
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: prompt }],
              },
            ],
          },
          parameters: { seed: seedBase + i },
        },
        {
          input: {
            messages: [
              {
                role: "user",
                content: [{ text: prompt }],
              },
            ],
          },
          parameters: { seed: seedBase + i },
        },
        {
          input: {
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          },
          parameters: { seed: seedBase + i },
        },
        {
          input: { prompt },
          parameters: { seed: seedBase + i },
        },
      ];

      for (const attempt of attempts) {
        const r = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: attempt.input,
            parameters: attempt.parameters,
          }),
        });

        const text = await r.text();
        let j: unknown = {};
        try {
          j = JSON.parse(text) as unknown;
        } catch {
          j = { raw: text };
        }
        last = { ok: r.ok, status: r.status, data: j };
        debug.push(last);
        if (!r.ok) continue;

        const candidates = extractHttpUrls(j);
        const imageUrl =
          candidates.find((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u)) ??
          candidates.find((u) => /aliyuncs\.com|oss-/.test(u)) ??
          candidates[0] ??
          null;
        if (imageUrl) {
          urls.push(imageUrl);
          break;
        }
      }

      if (urls.length >= i + 1) break;
    }
    if (!last?.ok) break;
  }

  return { urls, debug: debug[0] ?? null };
}

async function dashscopeReferenceGenerate(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  sizePreset: string;
  resolution: string;
  count: number;
  referenceImages: string[];
}) {
  const { apiKey, model, prompt, sizePreset, resolution, count, referenceImages } = opts;
  const size = pickDashScopeSize(sizePreset, resolution);

  const r = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {
            role: "user",
            content: [
              ...referenceImages.slice(0, 3).map((image) => ({ image })),
              {
                text: `请基于参考图生成新的商品营销图片，保留主体商品特征与整体风格一致性，并结合以下要求：${prompt}`,
              },
            ],
          },
        ],
      },
      parameters: {
        n: Math.max(1, Math.min(count, 6)),
        negative_prompt: "低清晰度，模糊，变形，多余文字，水印，logo",
        prompt_extend: true,
        watermark: false,
        size,
      },
    }),
  });

  const text = await r.text();
  let j: unknown = {};
  try {
    j = JSON.parse(text) as unknown;
  } catch {
    j = { raw: text };
  }

  const urls = extractHttpUrls(j);
  return {
    ok: r.ok,
    status: r.status,
    data: j,
    urls,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const prompt = String(body.prompt ?? "demo");
  const sizePreset = String(body.sizePreset ?? "3_4");
  const resolution = String(body.resolution ?? "1k");
  const referenceImages = Array.isArray(body.referenceImages)
    ? body.referenceImages.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, 3)
    : [];

  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
  const model = process.env.DASHSCOPE_IMAGE_MODEL || "qwen-image-max";
  const editModel = process.env.DASHSCOPE_IMAGE_EDIT_MODEL || "qwen-image-2.0-pro";

  if (apiKey) {
    if (referenceImages.length > 0) {
      try {
        const result = await dashscopeReferenceGenerate({
          apiKey,
          model: editModel,
          prompt,
          sizePreset,
          resolution,
          count: 3,
          referenceImages,
        });
        if (result.ok && result.urls.length > 0) {
          res.status(200).json({ urls: result.urls.slice(0, 3), provider: "dashscope_reference", model: editModel });
          return;
        }
        res.status(200).json({
          urls: fallbackUrls(prompt, sizePreset, resolution, referenceImages),
          provider: "dashscope_reference_error",
          model: editModel,
          dashscopeCreate: { ok: result.ok, status: result.status, data: result.data },
        });
        return;
      } catch (e) {
        res.status(200).json({
          urls: fallbackUrls(prompt, sizePreset, resolution, referenceImages),
          provider: "dashscope_reference_error",
          model: editModel,
          dashscopeCreate: {
            ok: false,
            data: { message: e instanceof Error ? e.message : String(e ?? "reference_generate_failed") },
          },
        });
        return;
      }
    }

    if (isWan26Model(model)) {
      try {
        console.log(`Using DashScope wan2.6 endpoint for model: ${model}`);
        const { urls, debug } = await dashscopeWan26Generate({
          apiKey,
          model,
          prompt,
          sizePreset,
          resolution,
          count: 3,
        });
        if (urls.length) {
          res.status(200).json({ urls, provider: "dashscope", model });
          return;
        }
        res.status(200).json({
          urls: fallbackUrls(prompt, sizePreset, resolution, referenceImages),
          provider: "dashscope_error",
          model,
          dashscopeCreate: debug,
        });
        return;
      } catch (e) {
        res.status(200).json({
          urls: fallbackUrls(prompt, sizePreset, resolution, referenceImages),
          provider: "dashscope_error",
          model,
          dashscopeCreate: {
            ok: false,
            data: { message: e instanceof Error ? e.message : String(e ?? "wan26_failed") },
          },
        });
        return;
      }
    }
    try {
      const size = pickDashScopeSize(sizePreset, resolution);
      // 阿里云旧协议（或部分模型）同样可能限制 seed 范围
      const seedBase = Math.floor(Math.random() * 2000000000);
      const urls: string[] = [];
      const fetchPromises = [];
      const createDebug: Array<{ ok: boolean; status?: number; data?: unknown }> = [];

      console.log(`Using DashScope model: ${model} for text-to-image`);

      for (let i = 0; i < 3; i++) {
        const payload = {
          model,
          input: {
            prompt: `高质量产品主图，商品：${prompt}，干净背景，商业摄影光照，8k分辨率，杰作`
          },
          parameters: {
            size,
            seed: seedBase + i,
          },
        };

        const p = fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable" // 官方建议使用异步
          },
          body: JSON.stringify(payload),
        }).then(async (r) => {
          const text = await r.text();
          let j: unknown = {};
          try { 
            j = JSON.parse(text) as unknown; 
          } catch { 
            console.error("Parse error:", text); 
          }
          createDebug.push({ ok: r.ok, status: r.status, data: j });
          return { ok: r.ok, data: j };
        }).catch(err => {
          console.error("Fetch request failed:", err);
          createDebug.push({
            ok: false,
            data: { message: err instanceof Error ? err.message : String(err ?? "fetch_failed") },
          });
          return { ok: false, data: {} };
        });
        fetchPromises.push(p);
      }

      const results = await Promise.all(fetchPromises);
      
      // 收集 task_id
      const taskIds = results
        .filter(r => r.ok && r.data?.output?.task_id)
        .map(r => String(r.data.output.task_id));

      if (taskIds.length === 0) {
        const directUrls = results
          .filter((r) => r.ok)
          .flatMap((r) => extractHttpUrls(r.data))
          .filter(Boolean);
        if (directUrls.length) {
          res.status(200).json({ urls: directUrls.slice(0, 3), provider: "dashscope", model });
          return;
        }

        const sample = createDebug.find((x) => x.ok) ?? createDebug[0];
        res.status(200).json({
          urls: fallbackUrls(prompt, sizePreset, resolution, referenceImages),
          provider: "dashscope_error",
          model,
          dashscopeCreate: sample ?? null,
        });
        return;
      }

      if (taskIds.length > 0) {
        console.log(`Created ${taskIds.length} async tasks, polling...`);
        // 轮询获取结果
        const maxAttempts = 15;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (urls.length >= taskIds.length) break;
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          for (const taskId of taskIds) {
            try {
              const r = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(taskId)}`, {
                method: "GET",
                headers: { Authorization: `Bearer ${apiKey}` },
              });
              const text = await r.text();
              let j: unknown = {};
              try {
                j = JSON.parse(text) as unknown;
              } catch {
                j = { raw: text };
              }
              const obj = (j ?? {}) as Record<string, unknown>;
              const output = (obj["output"] ?? {}) as Record<string, unknown>;
              const status = String(output["task_status"] ?? "");
              
              if (status === "SUCCEEDED") {
                const resultsArr = Array.isArray(output["results"]) ? (output["results"] as Array<Record<string, unknown>>) : [];
                for (const res of resultsArr) {
                  const url = String(res["url"] ?? "");
                  if (url && !urls.includes(url)) {
                    urls.push(url);
                  }
                }
              }
            } catch (e) {
              console.error("Polling error for task:", taskId, e);
            }
          }
        }
      }

      if (urls.length > 0) {
        res.status(200).json({ urls, provider: "dashscope", model });
        return;
      }
      console.log("DashScope generation failed or returned no URLs, falling back...");
      res.status(200).json({
        urls: fallbackUrls(prompt, sizePreset, resolution, referenceImages),
        provider: "dashscope_error",
        model,
        dashscopeCreate: createDebug[0] ?? null,
      });
      return;
    } catch (e) {
      console.error("DashScope top-level error:", e);
    }
  }

  try {
    const [w, h] = pickDimensions(sizePreset, resolution);
    const seedBase = Date.now();
    const englishPrompt = encodeURIComponent(
      `high quality product photography of ${prompt}, commercial lighting, clean background, 8k resolution, masterpiece`
    );

    const rawUrls = Array.from({ length: 3 }).map((_, i) => {
      const seed = seedBase + i;
      return `https://image.pollinations.ai/prompt/${englishPrompt}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
    });

    const dataUrls = await Promise.all(rawUrls.map(async (u) => fetchAsDataUrl(u, 15000)));
    const fallback = fallbackUrls(prompt, sizePreset, resolution, referenceImages);
    const urls = dataUrls.map((u, i) => u || fallback[i] || fallback[0]);

    res.status(200).json({ urls, provider: "pollinations", model: "stable-diffusion" });
    return;
  } catch (error) {
    console.error("Image generation error:", error);
    res.status(200).json({ urls: fallbackUrls(prompt, sizePreset, resolution, referenceImages), provider: "fallback" });
  }
}
