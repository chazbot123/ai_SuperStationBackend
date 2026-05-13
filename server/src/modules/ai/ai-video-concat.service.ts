import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpegStaticPath from 'ffmpeg-static';

export type SubtitleCue = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

@Injectable()
export class AiVideoConcatService {
  constructor(private readonly configService: ConfigService) {
    const resolvedFfmpegPath = this.resolveBinaryPath('FFMPEG_PATH', [
      '/usr/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      typeof ffmpegInstaller?.path === 'string' ? ffmpegInstaller.path : '',
      typeof ffmpegStaticPath === 'string' ? ffmpegStaticPath : '',
    ]);
    const resolvedFfprobePath = this.resolveBinaryPath('FFPROBE_PATH', [
      '/usr/bin/ffprobe',
      '/usr/local/bin/ffprobe',
      typeof ffprobeInstaller?.path === 'string' ? ffprobeInstaller.path : '',
    ]);

    if (resolvedFfmpegPath) {
      ffmpeg.setFfmpegPath(resolvedFfmpegPath);
    }
    if (resolvedFfprobePath) {
      ffmpeg.setFfprobePath(resolvedFfprobePath);
    }
  }

  async concatMp4Files(inputFiles: string[]) {
    if (inputFiles.length === 0) {
      throw new InternalServerErrorException('没有可拼接的视频片段');
    }

    const outputDir = join(tmpdir(), 'ai-superweb-video');
    await mkdir(outputDir, { recursive: true });
    const listPath = join(outputDir, `concat-${Date.now()}.txt`);
    const outputPath = join(outputDir, `final-${Date.now()}.mp4`);

    const listBody = inputFiles
      .map((file) => `file '${file.replace(/'/g, "'\\''")}'`)
      .join('\n');
    await writeFile(listPath, listBody, 'utf-8');

    try {
      await this.runConcat(listPath, outputPath);
      return Buffer.from(await readFile(outputPath));
    } catch (error) {
      try {
        await this.runReencode(listPath, outputPath);
        return Buffer.from(await readFile(outputPath));
      } catch {
        throw error instanceof Error
          ? new InternalServerErrorException(error.message)
          : new InternalServerErrorException('视频拼接失败');
      }
    }
  }

  async muxMp4WithAudio(opts: { videoBuffer: Buffer; audioBuffer: Buffer; audioExtension?: string }) {
    const outputDir = join(tmpdir(), 'ai-superweb-video');
    await mkdir(outputDir, { recursive: true });
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const videoPath = join(outputDir, `video-${suffix}.mp4`);
    const audioExt = (opts.audioExtension ?? 'mp3').replace(/^\./, '') || 'mp3';
    const audioPath = join(outputDir, `audio-${suffix}.${audioExt}`);
    const outputPath = join(outputDir, `mux-${suffix}.mp4`);

    await writeFile(videoPath, opts.videoBuffer);
    await writeFile(audioPath, opts.audioBuffer);

    try {
      await this.runMux(videoPath, audioPath, outputPath);
      return Buffer.from(await readFile(outputPath));
    } catch (error) {
      try {
        await this.runMuxReencode(videoPath, audioPath, outputPath);
        return Buffer.from(await readFile(outputPath));
      } catch {
        throw error instanceof Error
          ? new InternalServerErrorException(error.message)
          : new InternalServerErrorException('视频音频合成失败');
      }
    }
  }

  async muxMp4WithAudioMix(opts: {
    videoBuffer: Buffer;
    voiceAudioBuffer?: Buffer | null;
    voiceAudioExtension?: string;
    bgmAudioBuffer?: Buffer | null;
    bgmAudioExtension?: string;
    bgmVolume?: number;
    voiceVolume?: number;
  }) {
    const outputDir = join(tmpdir(), 'ai-superweb-video');
    await mkdir(outputDir, { recursive: true });
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const videoPath = join(outputDir, `video-${suffix}.mp4`);
    await writeFile(videoPath, opts.videoBuffer);

    const voiceBuffer = opts.voiceAudioBuffer ?? null;
    const bgmBuffer = opts.bgmAudioBuffer ?? null;
    if (!voiceBuffer && !bgmBuffer) {
      throw new InternalServerErrorException('缺少可用音频');
    }

    const voiceVol = Number.isFinite(opts.voiceVolume) ? Math.max(0, Math.min(2, Number(opts.voiceVolume))) : 1;
    const bgmVol = Number.isFinite(opts.bgmVolume) ? Math.max(0, Math.min(2, Number(opts.bgmVolume))) : 0.25;

    const outputPath = join(outputDir, `mix-${suffix}.mp4`);

    if (voiceBuffer && bgmBuffer) {
      const voiceExt = (opts.voiceAudioExtension ?? 'mp3').replace(/^\./, '') || 'mp3';
      const bgmExt = (opts.bgmAudioExtension ?? 'mp3').replace(/^\./, '') || 'mp3';
      const voicePath = join(outputDir, `voice-${suffix}.${voiceExt}`);
      const bgmPath = join(outputDir, `bgm-${suffix}.${bgmExt}`);
      await writeFile(voicePath, voiceBuffer);
      await writeFile(bgmPath, bgmBuffer);
      await this.runMuxWithMix(videoPath, voicePath, bgmPath, outputPath, voiceVol, bgmVol);
      return Buffer.from(await readFile(outputPath));
    }

    if (voiceBuffer) {
      const voiceExt = (opts.voiceAudioExtension ?? 'mp3').replace(/^\./, '') || 'mp3';
      const voicePath = join(outputDir, `voice-${suffix}.${voiceExt}`);
      await writeFile(voicePath, voiceBuffer);
      await this.runMux(videoPath, voicePath, outputPath);
      return Buffer.from(await readFile(outputPath));
    }

    const bgmExt = (opts.bgmAudioExtension ?? 'mp3').replace(/^\./, '') || 'mp3';
    const bgmPath = join(outputDir, `bgm-${suffix}.${bgmExt}`);
    await writeFile(bgmPath, bgmBuffer as Buffer);
    await this.runMuxLoopBgm(videoPath, bgmPath, outputPath, bgmVol);
    return Buffer.from(await readFile(outputPath));
  }

  async getVideoDuration(filePath: string) {
    return new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(error);
          return;
        }
        const duration = Number(metadata?.format?.duration ?? 0);
        if (Number.isFinite(duration) && duration > 0) {
          resolve(duration);
          return;
        }
        reject(new Error('无法读取视频时长'));
      });
    });
  }

  async getVideoFrameSize(filePath: string) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(error);
          return;
        }
        const videoStream = metadata?.streams?.find((stream) => stream.codec_type === 'video');
        const width = Number(videoStream?.width ?? 0);
        const height = Number(videoStream?.height ?? 0);
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          resolve({ width, height });
          return;
        }
        reject(new Error('无法读取视频分辨率'));
      });
    });
  }

  async burnSubtitles(opts: { videoBuffer: Buffer; cues: SubtitleCue[] }) {
    const validCues = opts.cues.filter(
      (cue) =>
        typeof cue.text === 'string' &&
        cue.text.trim() &&
        Number.isFinite(cue.startSeconds) &&
        Number.isFinite(cue.endSeconds) &&
        cue.endSeconds > cue.startSeconds,
    );
    if (validCues.length === 0) {
      return opts.videoBuffer;
    }

    const outputDir = join(tmpdir(), 'ai-superweb-video');
    await mkdir(outputDir, { recursive: true });
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const videoPath = join(outputDir, `subtitle-video-${suffix}.mp4`);
    const srtPath = join(outputDir, `subtitle-${suffix}.srt`);
    const outputPath = join(outputDir, `subtitle-burned-${suffix}.mp4`);

    await writeFile(videoPath, opts.videoBuffer);
    await writeFile(srtPath, this.buildSrt(validCues), 'utf-8');

    try {
      const frameSize = await this.getVideoFrameSize(videoPath);
      await this.runBurnSubtitles(videoPath, srtPath, outputPath, frameSize);
      return Buffer.from(await readFile(outputPath));
    } catch (error) {
      throw error instanceof Error
        ? new InternalServerErrorException(error.message)
        : new InternalServerErrorException('视频字幕烧录失败');
    }
  }

  private runConcat(listPath: string, outputPath: string) {
    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .on('error', reject)
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private runReencode(listPath: string, outputPath: string) {
    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c:v libx264', '-preset veryfast', '-pix_fmt yuv420p', '-c:a aac'])
        .on('error', reject)
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private runMux(videoPath: string, audioPath: string, outputPath: string) {
    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-map 0:v:0',
          '-map 1:a:0',
          '-c:v copy',
          '-c:a aac',
          '-b:a 128k',
          '-shortest',
        ])
        .on('error', reject)
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private runMuxReencode(videoPath: string, audioPath: string, outputPath: string) {
    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          '-map 0:v:0',
          '-map 1:a:0',
          '-c:v libx264',
          '-preset veryfast',
          '-pix_fmt yuv420p',
          '-c:a aac',
          '-b:a 128k',
          '-shortest',
        ])
        .on('error', reject)
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private runMuxLoopBgm(videoPath: string, bgmPath: string, outputPath: string, bgmVolume: number) {
    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(bgmPath)
        .inputOptions(['-stream_loop -1'])
        .audioFilters([`volume=${bgmVolume}`])
        .outputOptions([
          '-map 0:v:0',
          '-map 1:a:0',
          '-c:v copy',
          '-c:a aac',
          '-b:a 128k',
          '-shortest',
        ])
        .on('error', reject)
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private runMuxWithMix(
    videoPath: string,
    voicePath: string,
    bgmPath: string,
    outputPath: string,
    voiceVolume: number,
    bgmVolume: number,
  ) {
    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(voicePath)
        .input(bgmPath)
        .inputOptions(['-stream_loop -1'])
        .complexFilter([
          `[1:a]volume=${voiceVolume}[voice]`,
          `[2:a]volume=${bgmVolume}[bgm]`,
          `[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        ])
        .outputOptions([
          '-map 0:v:0',
          '-map [aout]',
          '-c:v copy',
          '-c:a aac',
          '-b:a 128k',
          '-shortest',
        ])
        .on('error', reject)
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private runBurnSubtitles(
    videoPath: string,
    subtitlePath: string,
    outputPath: string,
    frameSize: { width: number; height: number },
  ) {
    return new Promise<void>((resolve, reject) => {
      const escapedSubtitlePath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
      const fontName =
        process.platform === 'win32'
          ? 'SimHei'
          : process.platform === 'darwin'
            ? 'PingFangSC'
            : 'NotoSansCJKsc-Regular';
      const marginV = this.getSubtitleMarginV(frameSize);
      const marginH = this.getSubtitleMarginH(frameSize);
      const forceStyle = [
        `FontName=${fontName}`,
        'Alignment=2',
        `MarginV=${marginV}`,
        `MarginL=${marginH}`,
        `MarginR=${marginH}`,
        'FontSize=18',
        'Outline=2',
        'Shadow=0',
        'BorderStyle=1',
        'WrapStyle=2',
      ].join(',');
      const filter = `subtitles='${escapedSubtitlePath}':charenc=UTF-8:force_style='${forceStyle}'`;

      ffmpeg()
        .input(videoPath)
        .outputOptions([
          '-vf',
          filter,
          '-c:v libx264',
          '-preset veryfast',
          '-pix_fmt yuv420p',
          '-c:a copy',
        ])
        .on('error', reject)
        .on('end', () => resolve())
        .save(outputPath);
    });
  }

  private getSubtitleMarginV(frameSize: { width: number; height: number }) {
    const shorterSide = Math.min(frameSize.width, frameSize.height);
    const aspectRatio = frameSize.height / frameSize.width;
    const marginPercent = aspectRatio >= 1.6 ? 0.06 : aspectRatio >= 0.9 ? 0.055 : 0.05;
    return Math.max(24, Math.round(shorterSide * marginPercent));
  }

  private getSubtitleMarginH(frameSize: { width: number; height: number }) {
    const horizontalMargin = Math.round(frameSize.width * 0.07);
    return Math.max(20, horizontalMargin);
  }

  private resolveBinaryPath(envKey: 'FFMPEG_PATH' | 'FFPROBE_PATH', candidates: string[]) {
    const explicit = this.configService.get<string>(envKey)?.trim();
    if (explicit && existsSync(explicit)) {
      return explicit;
    }

    for (const candidate of candidates) {
      const normalized = candidate?.trim();
      if (normalized && existsSync(normalized)) {
        return normalized;
      }
    }

    return '';
  }

  private buildSrt(cues: SubtitleCue[]) {
    return cues
      .map((cue, index) => {
        const text = this.wrapSubtitleTextForSrt(cue.text);
        return `${index + 1}\n${this.formatSrtTime(cue.startSeconds)} --> ${this.formatSrtTime(cue.endSeconds)}\n${text}\n`;
      })
      .join('\n');
  }

  private wrapSubtitleTextForSrt(text: string) {
    const normalized = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!normalized) {
      return '';
    }

    const paragraphs = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const wrapped: string[] = [];
    for (const paragraph of paragraphs) {
      wrapped.push(...this.wrapSubtitleLine(paragraph, 10));
    }
    return wrapped.join('\n');
  }

  private wrapSubtitleLine(line: string, maxCharsPerLine: number) {
    if (!line) {
      return [];
    }
    const compact = line.replace(/\s+/g, ' ').trim();
    if (this.countSubtitleChars(compact) <= maxCharsPerLine) {
      return [compact];
    }

    const result: string[] = [];
    let cursor = '';
    let cursorChars = 0;
    for (const char of compact) {
      cursor += char;
      if (!/\s/.test(char)) {
        cursorChars += 1;
      }
      if (cursorChars >= maxCharsPerLine) {
        result.push(cursor.trim());
        cursor = '';
        cursorChars = 0;
      }
    }

    if (cursor.trim()) {
      result.push(cursor.trim());
    }
    return result;
  }

  private countSubtitleChars(text: string) {
    return text.replace(/\s+/g, '').length;
  }

  private formatSrtTime(seconds: number) {
    const safeMs = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(safeMs / 3600000);
    const minutes = Math.floor((safeMs % 3600000) / 60000);
    const secs = Math.floor((safeMs % 60000) / 1000);
    const ms = safeMs % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
}

