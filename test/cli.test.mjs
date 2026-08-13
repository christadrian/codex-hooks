import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { STOP_BLOCK_REASON } from '../src/hook-utils.mjs';

describe('codex-jmp-hook CLI', () => {
  it('emits no stdout on malformed stdin because approve decisions are invalid for Stop', () => {
    const result = spawnSync(process.execPath, ['bin/codex-jmp-hook.mjs'], {
      cwd: path.resolve('.'),
      input: '{not json',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  });

  it('emits no stdout for no-op hook responses', () => {
    const result = spawnSync(process.execPath, ['bin/codex-jmp-hook.mjs'], {
      cwd: path.resolve('.'),
      input: '{"hook_event_name":"UserPromptSubmit","prompt":"hello"}',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  });

  it('emits no stdout for allowed Stop responses because Stop only accepts decision:block', () => {
    const result = spawnSync(process.execPath, ['bin/codex-jmp-hook.mjs'], {
      cwd: path.resolve('.'),
      input: JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: 'Tests: npm test\nDONE' }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  });

  it('emits valid decision:block for Stop last_assistant_message without completion status', () => {
    const result = spawnSync(process.execPath, ['bin/codex-jmp-hook.mjs'], {
      cwd: path.resolve('.'),
      input: JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: 'Tests pass.' }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      decision: 'block',
      reason: STOP_BLOCK_REASON,
    });
    assert.equal(result.stderr, '');
  });

  it('writes redacted debug payloads with private permissions', () => {
    const pluginData = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-debug-'));
    try {
      const result = spawnSync(process.execPath, ['bin/codex-jmp-hook.mjs'], {
        cwd: path.resolve('.'),
        input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'hello', api_key: 'secret-value' }),
        encoding: 'utf8',
        env: { ...process.env, CODEX_HOOKS_DEBUG: '1', PLUGIN_DATA: pluginData },
      });
      const logPath = path.join(pluginData, 'hooks-debug.jsonl');
      const log = fs.readFileSync(logPath, 'utf8');

      assert.equal(result.status, 0);
      assert.match(log, /\[REDACTED\]/);
      assert.doesNotMatch(log, /secret-value/);
      assert.equal(fs.statSync(logPath).mode & 0o777, 0o600);
    } finally {
      fs.rmSync(pluginData, { recursive: true, force: true });
    }
  });
});
