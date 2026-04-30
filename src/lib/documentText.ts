import JSZip from "jszip";

function getExt(name: string) {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function normalizeWhitespace(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxText(buffer: ArrayBuffer) {
  const mod: any = await import("mammoth");
  const result = await mod.extractRawText({ arrayBuffer: buffer });
  return normalizeWhitespace(String(result?.value ?? ""));
}

async function extractPdfText(buffer: ArrayBuffer) {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items ?? [])
      .map((item: any) => String(item?.str ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (text) parts.push(text);
  }
  return normalizeWhitespace(parts.join("\n\n"));
}

function extractTextFromXml(xml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const nodes = Array.from(doc.getElementsByTagName("*"));
  const out: string[] = [];
  for (const node of nodes) {
    if ((node as any).localName === "t") {
      const value = node.textContent?.trim();
      if (value) out.push(value);
    }
  }
  return normalizeWhitespace(out.join("\n"));
}

async function extractPptxText(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const ai = Number(/slide(\d+)\.xml$/i.exec(a)?.[1] ?? 0);
      const bi = Number(/slide(\d+)\.xml$/i.exec(b)?.[1] ?? 0);
      return ai - bi;
    });

  const parts: string[] = [];
  for (const name of slideNames) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    const text = extractTextFromXml(xml);
    if (text) parts.push(text);
  }
  return normalizeWhitespace(parts.join("\n\n"));
}

export async function extractTextFromDocument(file: File) {
  const ext = getExt(file.name);
  const buffer = await file.arrayBuffer();
  if (ext === "docx") {
    return extractDocxText(buffer);
  }
  if (ext === "pdf") {
    return extractPdfText(buffer);
  }
  if (ext === "pptx") {
    return extractPptxText(buffer);
  }
  if (ext === "doc") {
    throw new Error("暂不支持解析 .doc，请另存为 .docx 后再上传");
  }
  if (ext === "ppt") {
    throw new Error("暂不支持解析 .ppt，请另存为 .pptx 后再上传");
  }
  throw new Error("仅支持解析 Word(.docx)、PPT(.pptx)、PDF(.pdf)");
}

export function extractKeyPointsFromText(input: string) {
  const text = normalizeWhitespace(input);
  if (!text) return "";
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const picked: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    const t = line.replace(/\s+/g, " ").trim();
    if (!t) return;
    if (t.length > 120) return;
    if (seen.has(t)) return;
    seen.add(t);
    picked.push(t);
  };

  for (const line of lines) {
    if (picked.length >= 24) break;
    if (/^(?:[-•*]|[0-9]+[.)、]|[（(]?[一二三四五六七八九十]+[)）、.])\s*/.test(line)) {
      push(line.replace(/^(?:[-•*]|[0-9]+[.)、]|[（(]?[一二三四五六七八九十]+[)）、.])\s*/g, ""));
      continue;
    }
    if (/[：:]/.test(line) && line.length <= 80) {
      push(line);
      continue;
    }
    if (/^(?:要点|卖点|亮点|关键词|功能|参数|规格|价格|活动|优惠|渠道|适用人群|适用场景)/.test(line)) {
      push(line);
    }
  }

  if (picked.length >= 3) {
    return picked.join("\n");
  }
  return text.slice(0, 1800);
}

