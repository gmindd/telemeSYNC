import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

export const FFMPEG = process.env.FFMPEG_PATH ?? (ffmpegPath as unknown as string);

export function tmpDir(prefix = 'telemesync-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Creates a tiny synthetic test clip with ffmpeg. */
export function makeClip(path: string, opts: { seconds: number; fps: string; size?: string; creationTime?: string; timecode?: string; faststart?: boolean; codec?: string }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${opts.size ?? '320x240'}:rate=${opts.fps}:duration=${opts.seconds}`];
  args.push('-c:v', opts.codec ?? 'libx264', '-pix_fmt', 'yuv420p');
  if (opts.creationTime) args.push('-metadata', `creation_time=${opts.creationTime}`);
  if (opts.timecode) args.push('-timecode', opts.timecode);
  if (opts.faststart) args.push('-movflags', '+faststart');
  args.push(path);
  execFileSync(FFMPEG, args);
}

export function ffprobeJson(path: string): any {
  // ffmpeg-static has no ffprobe; use `ffmpeg -i` output parsing only when needed.
  const out = execFileSync(FFMPEG, ['-hide_banner', '-i', path, '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out;
}
