// Fallback player for clips the WebView's <video> can't play (some phones and HEVC, some engines and H.264): frames
// come from WebCodecs through Mediabunny, the same decoder the export uses, timed against the clock. No sound.
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';

type Draw = (frame: HTMLCanvasElement | OffscreenCanvas, sec: number) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FramePlayer {
  paused = true;
  time = 0;
  private input: Input;
  private sink?: CanvasSink;
  private first = 0;
  /** Changes on every seek/play/pause: older loops see it and stop. */
  private token = 0;

  constructor(
    file: Blob,
    private draw: Draw,
    private onState: (playing: boolean) => void,
  ) {
    this.input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  }

  /** Opens the track; frames are decoded at a preview size (short side 720 at most). */
  async init(): Promise<void> {
    const track = await this.input.getPrimaryVideoTrack();
    if (!track) throw new Error('no video track');
    this.first = await track.getFirstTimestamp();
    const k = Math.min(1, 720 / Math.min(track.displayWidth, track.displayHeight));
    this.sink = new CanvasSink(track, { width: Math.round(track.displayWidth * k), height: Math.round(track.displayHeight * k), fit: 'fill', poolSize: 3 });
  }

  async seek(sec: number): Promise<void> {
    const token = ++this.token;
    this.time = sec;
    const f = await this.sink?.getCanvas(this.first + sec);
    if (f && token === this.token) this.draw(f.canvas, sec);
  }

  async play(from: number, until: number): Promise<void> {
    if (!this.sink) return;
    const token = ++this.token;
    this.paused = false;
    this.onState(true);
    const t0 = performance.now();
    for await (const f of this.sink.canvases(this.first + from)) {
      if (token !== this.token) break;
      const sec = f.timestamp - this.first;
      if (sec >= until) break;
      const wait = (sec - from) * 1000 - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      if (token !== this.token) break;
      this.time = sec;
      this.draw(f.canvas, sec);
    }
    if (token === this.token) {
      this.paused = true;
      this.onState(false);
    }
  }

  pause(): void {
    this.token++;
    if (!this.paused) {
      this.paused = true;
      this.onState(false);
    }
  }

  dispose(): void {
    this.token++;
    this.input.dispose();
  }
}
