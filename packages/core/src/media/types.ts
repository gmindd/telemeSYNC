export interface Fps {
  num: number;
  den: number;
}

/** Container metadata of a clip. Only metadata — the video is never decoded. */
export interface ClipMetadata {
  fileName: string;
  sizeBytes: number;
  /** File system modification time, if known (ms). */
  lastModifiedMs?: number;
  durationMs: number;
  fps?: Fps;
  frameCount?: number;
  width?: number;
  height?: number;
  /** Sample entry fourcc of the video track (avc1, hvc1, hev1, …). */
  codec?: string;
  majorBrand?: string;
  /**
   * mvhd creation_time converted as if it were UTC (ms since epoch). Whether it is really UTC,
   * local time, start or end of recording depends on the camera — see sync/profiles.
   */
  creationTimeRawMs?: number;
  modificationTimeRawMs?: number;
  /** Start timecode of a tmcd track, in seconds since midnight (camera local time of day). */
  timecodeStartSec?: number;
  /** Handler types of all tracks (vide, soun, meta, tmcd, …). */
  handlers: string[];
  /** Handler names (e.g. "GoPro AVC", "GoPro MET", "DJI.Meta"). */
  handlerNames: string[];
  /** True if a GoPro GPMF metadata track ('gpmd') exists. */
  hasGpmf: boolean;
  /** Text tags from udta and meta/keys (e.g. ©mak, ©mod, FIRM, com.apple.quicktime.creationdate). */
  tags: Record<string, string>;
}
