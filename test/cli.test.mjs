import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';

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
      input: JSON.stringify({ hook_event_name: 'Stop', last_assistant_message: 'DONE\nTests: npm test' }),
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
      reason: 'Missing completion status. End with DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT plus evidence.',
    });
    assert.equal(result.stderr, '');
  });
});
