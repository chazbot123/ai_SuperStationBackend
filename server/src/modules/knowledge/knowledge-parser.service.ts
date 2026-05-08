import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';

@Injectable()
export class KnowledgeParserService {
  private static readonly MIN_PDF_TEXT_LENGTH = 20;

  async extractText(fileExt: string, buffer: Buffer) {
    const normalizedExt = fileExt.toLowerCase();

    if (normalizedExt === 'txt' || normalizedExt === 'md') {
      return buffer.toString('utf8');
    }

    if (normalizedExt === 'pdf') {
      return this.extractPdfText(buffer);
    }

    if (normalizedExt === 'docx') {
      return this.extractDocxText(buffer);
    }

    if (normalizedExt === 'pptx') {
      return this.extractPptxText(buffer);
    }

    if (['png', 'jpg', 'jpeg', 'webp'].includes(normalizedExt)) {
      return this.extractImageText(buffer);
    }

    throw new Error(`当前索引器暂不支持 ${normalizedExt}`);
  }

  private async extractPdfText(buffer: Buffer) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      const extractedText = this.normalizeExtractedText(result.text ?? '');
      if (this.hasUsablePdfText(extractedText)) {
        return extractedText;
      }

      const screenshots = await parser.getScreenshot({
        imageBuffer: true,
        imageDataUrl: false,
        scale: 2,
      });

      return this.extractTextFromPdfScreenshots(screenshots.pages);
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocxText(buffer: Buffer) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }

  private async extractPptxText(buffer: Buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const slidePaths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    const slideTexts = await Promise.all(
      slidePaths.map(async (slidePath) => {
        const xml = await zip.file(slidePath)?.async('text');
        if (!xml) {
          return '';
        }

        return xml
          .replace(/<a:br\s*\/>/gi, '\n')
          .replace(/<\/a:p>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }),
    );

    return slideTexts
      .map((text, index) => (text ? `第 ${index + 1} 页\n${text}` : ''))
      .filter(Boolean)
      .join('\n\n');
  }

  private async extractImageText(buffer: Buffer) {
    const worker = await createWorker('chi_sim+eng');

    try {
      return this.recognizeWithWorker(worker, buffer);
    } finally {
      await worker.terminate();
    }
  }

  private async extractTextFromPdfScreenshots(pages: Array<{ data: Uint8Array; pageNumber: number }>) {
    if (pages.length === 0) {
      return '';
    }

    const worker = await createWorker('chi_sim+eng');

    try {
      const pageTexts: string[] = [];
      for (const page of pages) {
        const pageText = await this.recognizeWithWorker(worker, Buffer.from(page.data));
        const normalizedPageText = this.normalizeExtractedText(pageText);
        if (normalizedPageText) {
          pageTexts.push(`第 ${page.pageNumber} 页\n${normalizedPageText}`);
        }
      }

      return pageTexts.join('\n\n');
    } finally {
      await worker.terminate();
    }
  }

  private async recognizeWithWorker(worker: Awaited<ReturnType<typeof createWorker>>, buffer: Buffer) {
    const result = await worker.recognize(buffer);
    return result.data.text ?? '';
  }

  private hasUsablePdfText(text: string) {
    const contentLength = text.replace(/\s+/g, '').length;
    return contentLength >= KnowledgeParserService.MIN_PDF_TEXT_LENGTH;
  }

  private normalizeExtractedText(text: string) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
