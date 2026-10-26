import type { Fps, GadgetPlacement, OutputFormat, OverlayId, OverlayStyle, RideData } from '@telemesync/core';

/** One export rendered by a browser worker (the in-app counterpart of the server's WorkerJob). */
export interface LocalTaskJob {
  ride: RideData;
  overlay: OverlayId | 'composite';
  overlays?: OverlayId[];
  placements?: Record<OverlayId, GadgetPlacement>;
  compositeWidth?: number;
  compositeHeight?: number;
  style: OverlayStyle;
  clipStart: number;
  clipEnd: number;
  durationMs: number;
  fps: Fps;
  frames?: number;
  format: OutputFormat;
}

export type ToWorker = { type: 'start'; job: LocalTaskJob } | { type: 'ack'; seq: number; error?: string } | { type: 'abort' };

/** Bytes travel as base64: the Android bridge only takes strings. */
export type WorkerRequest =
  | { type: 'write'; b64: string }
  | { type: 'writeAt'; offset: number; b64: string }
  /** One PNG of a sequence, `name` inside the task's folder. */
  | { type: 'file'; name: string; b64: string };

export type ToMain =
  | (WorkerRequest & { seq: number })
  | { type: 'progress'; value: number }
  | { type: 'done' }
  | { type: 'aborted' }
  | { type: 'error'; message: string };
