import { spawn } from 'node:child_process';

/** Opens a folder in the OS file explorer, or a URL in the default browser. */
export function openPath(target: string): void {
  let cmd: string;
  let args: string[];
  if (process.platform === 'win32') {
    if (/^https?:/i.test(target)) {
      cmd = 'cmd';
      args = ['/c', 'start', '""', target];
    } else {
      cmd = 'explorer.exe';
      args = [target];
    }
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [target];
  } else {
    cmd = 'xdg-open';
    args = [target];
  }
  // `start "" <url>` needs the empty title verbatim (no Node quoting); URLs here never contain spaces or &.
  const verbatim = process.platform === 'win32' && cmd === 'cmd';
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: verbatim });
  child.on('error', () => undefined);
  child.unref();
}
