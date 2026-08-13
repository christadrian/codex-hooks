import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('install-user-hook', () => {
  it('installs hooks into config.toml and removes migrated legacy hooks.json entries', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-home-'));
    const codexDir = path.join(home, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });

    fs.writeFileSync(path.join(codexDir, 'config.toml'), 'model = "gpt-5"\n');
    fs.writeFileSync(
      path.join(codexDir, 'hooks.json'),
      `${JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: `node "${path.resolve('bin/codex-jmp-hook.mjs')}"`,
                  },
                ],
              },
              { hooks: [{ type: 'command', command: 'echo keep' }] },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );

    execFileSync(process.execPath, ['scripts/install-user-hook.mjs'], {
      cwd: path.resolve('.'),
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });

    const configToml = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
    const hooksJson = JSON.parse(fs.readFileSync(path.join(codexDir, 'hooks.json'), 'utf8'));

    assert.match(configToml, /model = "gpt-5"/);
    assert.match(configToml, /# BEGIN codex-javascript-mastery-hooks/);
    assert.match(configToml, /\[\[hooks\.Stop\]\]/);
    assert.match(configToml, /\[\[hooks\.SessionEnd\]\]/);
    assert.deepEqual(hooksJson.hooks.Stop, [{ hooks: [{ type: 'command', command: 'echo keep' }] }]);
  });

  it('deletes legacy hooks.json when every hook was migrated', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-home-'));
    const codexDir = path.join(home, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });

    fs.writeFileSync(
      path.join(codexDir, 'hooks.json'),
      `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: `node "${path.resolve('bin/codex-jmp-hook.mjs')}"` }] }] } })}\n`,
    );

    execFileSync(process.execPath, ['scripts/install-user-hook.mjs'], {
      cwd: path.resolve('.'),
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });

    assert.equal(fs.existsSync(path.join(codexDir, 'hooks.json')), false);
    assert.match(fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8'), /codex-jmp-hook\.mjs/);
  });
});

describe('package publish config', () => {
  it('publishes runtime files and excludes local memory/test artifacts', () => {
    assert.deepEqual(packageJson.files, ['.codex-plugin/', 'hooks/', 'bin/', 'src/', 'scripts/', 'README.md']);
  });
});
