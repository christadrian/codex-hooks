import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';

describe('codex-jmp-hook CLI', () => {
  it('returns valid Stop JSON instead of crashing on malformed stdin', () => {
    const result = spawnSync(process.execPath, ['bin/codex-jmp-hook.mjs'], {
      cwd: path.resolve('.'),
      input: '{not json',
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      decision: 'approve',
      systemMessage: 'Hook input was not valid JSON. Continue, but inspect hook payload generation if this repeats.',
    });
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
});
