import { open, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { readClipMetadata, type ByteSource } from '../media/isobmff.ts';
import type { ClipMetadata } from '../media/types.ts';

/** Reads clip metadata from a local file path (Node). */
export async function readClipMetadataFromPath(path: string): Promise<ClipMetadata> {
  const st = await stat(path);
  const fh = await open(path, 'r');
  try {
    const src: ByteSource = {
      size: st.size,
      read: async (offset, length) => {
        const len = Math.max(0, Math.min(length, st.size - offset));
        const buf = new Uint8Array(len);
        await fh.read(buf, 0, len, offset);
        return buf;
      },
    };
    return await readClipMetadata(src, basename(path), st.mtimeMs);
  } finally {
    await fh.close();
  }
}
