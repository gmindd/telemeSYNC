import { describe, expect, it } from 'vitest';
import { parseProject, PROJECT_VERSION, serializeProject, type ProjectFile } from '../src/index.ts';
import { DEFAULT_STYLE } from '../src/overlays/types.ts';

const base: ProjectFile = { version: PROJECT_VERSION, name: 'Trail', cameras: [], clips: [], overlays: ['pace'], style: DEFAULT_STYLE, output: { format: 'prores' } };

describe('project file', () => {
  it('keeps the sport tab of step 4', () => {
    expect(parseProject(serializeProject({ ...base, sport: 'running' })).sport).toBe('running');
    expect(parseProject(serializeProject({ ...base, sport: 'snow' })).sport).toBe('snow');
  });

  it('opens older projects (no sport) and ignores an unknown one', () => {
    expect(parseProject(serializeProject(base)).sport).toBeUndefined();
    expect(parseProject(JSON.stringify({ ...base, sport: 'swimming' })).sport).toBeUndefined();
  });
});
