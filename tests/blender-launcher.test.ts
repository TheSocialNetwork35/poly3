import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const folders: string[] = [];
afterEach(() => { for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "Blender user's scene ")); folders.push(root);
  copyFileSync(new URL('../src/polyviewer/blender/Import-Blender.command', import.meta.url), join(root, 'Import-Blender.command'));
  writeFileSync(join(root, 'import_scene.py'), ''); writeFileSync(join(root, 'scene.json'), '{}'); mkdirSync(join(root, 'frames'));
  const binary = join(root, 'Fake Blender');
  writeFileSync(binary, '#!/bin/bash\nprintf "%s\\n" "$PWD" "$@" > "$LAUNCH_LOG"\nexit "${FAKE_EXIT:-0}"\n', { mode: 0o755 });
  const log = join(root, 'arguments.txt');
  const run = (extra = {}) => spawnSync('/bin/bash', [join(root, 'Import-Blender.command')], {
    cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, BLENDER_EXECUTABLE: binary, LAUNCH_LOG: log, ...extra },
  });
  return { root, log, run };
}
describe('Blender Mac launcher', () => {
  it('imports relative to the archive with safely quoted executable and scene paths', () => {
    const { root, log, run } = fixture();
    expect(run().status).toBe(0);
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
      root, '--factory-startup', '--python-exit-code', '1', '--python', join(root, 'import_scene.py'),
    ]);
  });
  it('reports missing Blender, incomplete archives and importer failures', () => {
    const { root, run } = fixture();
    expect(run({ BLENDER_EXECUTABLE: '/missing/blender' }).stdout).toContain('Blender was not found');
    expect(run({ FAKE_EXIT: '1' }).status).toBe(1);
    rmSync(join(root, 'scene.json'));
    const result = run(); expect(result.status).toBe(1); expect(result.stdout).toContain('Extract the entire ZIP');
  });
});
