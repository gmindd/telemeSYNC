import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Settings {
  outputDir: string;
}

function configDir(): string {
  if (process.env.TELEMESYNC_CONFIG_DIR) return process.env.TELEMESYNC_CONFIG_DIR;
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'telemeSYNC');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'telemeSYNC');
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'telemesync');
}

export const DEFAULT_SETTINGS: Settings = {
  // "Documentos" on a Portuguese Windows is the localised name of the Documents folder.
  outputDir: join(homedir(), 'Documents', 'telemeSYNC'),
};

const file = () => join(configDir(), 'settings.json');

export async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await readFile(file(), 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await mkdir(dirname(file()), { recursive: true });
  await writeFile(file(), JSON.stringify(s, null, 2));
}
