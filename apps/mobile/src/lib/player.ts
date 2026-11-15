// The editor's player, shared by the stage (which owns it) and the timeline (which seeks and plays it): the
// WebView's <video>, or the frame player when the <video> can't play the clip.
import { useProject } from '../state.ts';
import type { FramePlayer } from './framePlayer.ts';

let video: HTMLVideoElement | null = null;
let frames: FramePlayer | null = null;

export function attachVideo(el: HTMLVideoElement | null) {
  video = el;
}

export function attachFrames(p: FramePlayer | null) {
  frames = p;
}

/** Seconds from the clip's first frame. */
export function seek(s: number) {
  const { info, setPlayhead } = useProject.getState();
  const v = Math.min(Math.max(s, 0), info?.durationS ?? s);
  setPlayhead(v);
  if (frames) {
    frames.pause();
    void frames.seek(v);
  } else if (video) video.currentTime = v;
}

export function togglePlay() {
  const { trim, playheadS } = useProject.getState();
  if (frames) {
    if (!frames.paused) return frames.pause();
    const from = playheadS < trim.start || playheadS >= trim.end - 0.05 ? trim.start : playheadS;
    void frames.play(from, trim.end);
    return;
  }
  if (!video) return;
  if (video.paused) {
    if (video.currentTime < trim.start || video.currentTime >= trim.end - 0.05) video.currentTime = trim.start;
    void video.play();
  } else video.pause();
}

export function pause() {
  frames?.pause();
  video?.pause();
}
