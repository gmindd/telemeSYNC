import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type { Fps } from '../media/types.ts';

export function ffmpegPath(): string {
  const p = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string | null);
  if (!p) throw new Error('FFmpeg não encontrado. Instale o pacote ffmpeg-static ou defina FFMPEG_PATH.');
  return p;
}

export interface FfmpegSinkOptions {
  width: number;
  height: number;
  fps: Fps;
  outPath: string;
}

/** ffmpeg arguments: raw RGBA frames on stdin → ProRes 4444 with alpha (.mov). */
export function proresArgs(o: FfmpegSinkOptions): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.width}x${o.height}`, '-framerate', `${o.fps.num}/${o.fps.den}`,
    '-i', 'pipe:0',
    '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16',
    // Fixed quantiser: ~5× faster than rate-controlled prores_ks, visually lossless (PSNR ≈ 71 dB) for flat graphics.
    '-qscale:v', '2',
    '-vendor', 'apl0',
    '-r', `${o.fps.num}/${o.fps.den}`,
    '-an',
    o.outPath,
  ];
}

/** Writable sink of RGBA frames into an ffmpeg process. */
export class FfmpegSink {
  private proc: ChildProcessWithoutNullStreams;
  private stderr = '';
  private exited: Promise<void>;

  constructor(opts: FfmpegSinkOptions) {
    this.proc = spawn(ffmpegPath(), proresArgs(opts), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc.stderr.on('data', (d) => (this.stderr += String(d)));
    this.proc.stdin.on('error', () => {
      /* reported through exit code */
    });
    this.exited = new Promise((resolve, reject) => {
      this.proc.on('error', reject);
      this.proc.on('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg terminou com erro (${code ?? signal}): ${this.stderr.trim().slice(-800)}`));
      });
    });
    this.exited.catch(() => undefined);
  }

  /** Writes one frame, waiting for the pipe to drain when its buffer is full. */
  async write(frame: Uint8Array): Promise<void> {
    if (!this.proc.stdin.write(frame)) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = () => {
          cleanup();
          resolve();
        };
        const onClose = () => {
          cleanup();
          reject(new Error(`FFmpeg fechou inesperadamente: ${this.stderr.trim().slice(-800)}`));
        };
        const cleanup = () => {
          this.proc.stdin.off('drain', onDrain);
          this.proc.off('close', onClose);
        };
        this.proc.stdin.on('drain', onDrain);
        this.proc.on('close', onClose);
      });
    }
  }

  async finish(): Promise<void> {
    this.proc.stdin.end();
    await this.exited;
  }

  abort(): void {
    this.proc.stdin.destroy();
    this.proc.kill('SIGKILL');
  }
}
