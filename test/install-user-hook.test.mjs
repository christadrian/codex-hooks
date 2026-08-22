import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { resolveRepoPath } from '../plugins/codex-javascript-mastery-hooks/scripts/install-user-hook.mjs';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const pluginRoot = path.resolve('plugins/codex-javascript-mastery-hooks');
const installScript = path.join(pluginRoot, 'scripts/install-user-hook.mjs');

describe('installer path handling', () => {
  it('decodes spaces and Unicode in the checkout path', () => {
    const checkout = path.join(os.tmpdir(), 'codex hooks-é');
    const moduleUrl = new URL(`file://${path.join(checkout, 'scripts/install-user-hook.mjs')}`);

    assert.equal(resolveRepoPath(moduleUrl), checkout);
  });
});

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
                    command: `node "${path.resolve(pluginRoot, 'bin/codex-jmp-hook.mjs')}"`,
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

    execFileSync(process.execPath, [installScript], {
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
      `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: `node "${path.resolve(pluginRoot, 'bin/codex-jmp-hook.mjs')}"` }] }] } })}\n`,
    );

    execFileSync(process.execPath, [installScript], {
      cwd: path.resolve('.'),
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });

    assert.equal(fs.existsSync(path.join(codexDir, 'hooks.json')), false);
    assert.match(fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8'), /codex-jmp-hook\.mjs/);
  });

  it('does not change config.toml when legacy hooks.json is malformed', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-home-'));
    const codexDir = path.join(home, '.codex');
    const config = 'model = "gpt-5"\n';
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(path.join(codexDir, 'config.toml'), config);
    fs.writeFileSync(path.join(codexDir, 'hooks.json'), '{not-json');

    assert.throws(
      () => execFileSync(process.execPath, [installScript], {
        cwd: path.resolve('.'),
        env: { ...process.env, HOME: home, USERPROFILE: home },
        stdio: ['ignore', 'ignore', 'ignore'],
      }),
    );

    assert.equal(fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8'), config);
  });
});

describe('package publish config', () => {
  it('publishes runtime files and excludes local memory/test artifacts', () => {
    assert.deepEqual(packageJson.files, ['plugins/codex-javascript-mastery-hooks/', 'README.md']);
  });

  it('keeps the marketplace root separate from the plugin root', () => {
    const marketplace = JSON.parse(fs.readFileSync('.agents/plugins/marketplace.json', 'utf8'));
    const sourcePath = marketplace.plugins[0].source.path;
    const pluginPath = path.resolve(sourcePath);
    const pluginManifest = JSON.parse(fs.readFileSync(path.join(pluginPath, '.codex-plugin/plugin.json'), 'utf8'));
    const hooks = JSON.parse(fs.readFileSync(path.join(pluginPath, 'hooks/hooks.json'), 'utf8'));

    assert.equal(sourcePath, './plugins/codex-javascript-mastery-hooks');
    assert.equal(fs.existsSync('.codex-plugin/plugin.json'), false);
    assert.equal(pluginManifest.hooks, './hooks/hooks.json');
    for (const entries of Object.values(hooks.hooks)) {
      const hook = entries[0].hooks[0];
      assert.match(hook.command, /^node "\$\{PLUGIN_ROOT\}\/bin\/codex-jmp-hook\.mjs"$/);
      assert.match(hook.commandWindows, /^node "%PLUGIN_ROOT%\\bin\\codex-jmp-hook\.mjs"$/);
    }
  });
});
