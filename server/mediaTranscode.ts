import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

export interface VideoProbe {
  width: number;
  height: number;
  aspect: number; // width/height
  durationSec: number | null;
}

export interface TranscodeResult {
  videoPath: string;
  transcoded: boolean;
  cleanup: () => void;
}

const FFMPEG = (ffmpegPath as unknown as string) || 'ffmpeg';

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(FFMPEG, args, { maxBuffer: 16 * 1024 * 1024 }, (err, _stdout, stderr) => {
      // ffmpeg exits non-zero on some probe-only invocations; stderr carries the info
      resolve({ code: err ? (err as any).code ?? 1 : 0, stderr: String(stderr || '') });
    });
  });
}

/** Parse `ffmpeg -i` stderr → dimensions/duration. Returns null for non-video. */
export async function probeVideo(filePath: string): Promise<VideoProbe | null> {
  const { stderr } = await runFfmpeg(['-hide_banner', '-i', filePath]);
  const dim = stderr.match(/Video:.*?(\d{3,5})x(\d{3,5})/);
  if (!dim) return null;
  const width = parseInt(dim[1], 10);
  const height = parseInt(dim[2], 10);
  if (!width || !height) return null;
  const dur = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const durationSec = dur ? parseInt(dur[1], 10) * 3600 + parseInt(dur[2], 10) * 60 + parseFloat(dur[3]) : null;
  return { width, height, aspect: width / height, durationSec };
}

/**
 * Preferred delivery aspect per platform.
 * All current adapters publish short-form vertical video (Reels/TikTok/Shorts).
 */
export const PLATFORM_ASPECT: Record<string, number> = {
  tiktok: 9 / 16,
  instagram: 9 / 16,
  facebook: 9 / 16,
  meta: 9 / 16,
  // youtube omitted: accepts any aspect (long-form 16:9 stays untouched, vertical becomes a Short)
};

const ASPECT_TOLERANCE = 0.08; // ~8% — 9:16 (0.5625) vs 1:1 (1.0) clearly differs

function aspectMatches(source: number, target: number): boolean {
  return Math.abs(source - target) / target <= ASPECT_TOLERANCE;
}

/**
 * Return a video file matching the platform's preferred aspect.
 * - Same aspect → original path, no work.
 * - Different → ffmpeg scale+crop to target aspect (1080px on the long edge for
 *   vertical, keeps square pixels), written to a temp file.
 * Throws on probe/transcode failure — caller must fail honestly.
 */
export async function ensurePlatformAspect(videoPath: string, platform: string): Promise<TranscodeResult> {
  const noop: () => void = () => {};
  const targetAspect = PLATFORM_ASPECT[platform];
  if (!targetAspect) return { videoPath, transcoded: false, cleanup: noop };

  const probe = await probeVideo(videoPath);
  if (!probe) {
    // Not a probeable video (or ffmpeg missing) — pass through; the platform API
    // will validate the actual bytes and reject honestly if unsupported.
    return { videoPath, transcoded: false, cleanup: noop };
  }
  if (aspectMatches(probe.aspect, targetAspect)) {
    return { videoPath, transcoded: false, cleanup: noop };
  }

  const tmpPath = path.join(os.tmpdir(), `sra-transcode-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  // Cover-crop: scale so the shorter dimension fills, then center-crop to exact aspect.
  // For 9:16 target: force output 1080x1920 (or proportional even dims).
  const vertical = targetAspect < 1;
  const outW = vertical ? 1080 : 1920;
  const outH = vertical ? 1920 : 1080;
  const vf = `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;

  const { code, stderr } = await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', videoPath,
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    tmpPath,
  ]);
  if (code !== 0 || !fs.existsSync(tmpPath) || fs.statSync(tmpPath).size === 0) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw new Error(`Transcode failed (exit ${code}): ${stderr.slice(-400)}`);
  }

  return {
    videoPath: tmpPath,
    transcoded: true,
    cleanup: () => { try { fs.unlinkSync(tmpPath); } catch {} },
  };
}
