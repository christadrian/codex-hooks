#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildHookResponse, clearTurnEdited, markTurnEdited } from '../src/hook-utils.mjs';

const cases = [
  {
    name: 'stays silent for ordinary UI feature prompts',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Create a settings card component' },
    expectEqual: null,
  },
  {
    name: 'routes greenfield architecture prompts to architect',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Greenfield system design for billing' },
    expect: /"hookEventName":"UserPromptSubmit"[\s\S]*Use `architect`/,
  },
  {
    name: 'warns after substantial UI surface creation',
    input: {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: { patch: '*** Add File: components/SettingsCard.tsx\n+export function SettingsCard(){return null}' },
    },
    expect: /"hookEventName":"PostToolUse"[\s\S]*\/imprint/,
  },
  {
    name: 'stays silent after tiny UI prop edits',
    input: {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: { patch: '*** Update File: components/SettingsCard.tsx\n-a\n+b' },
    },
    expectEqual: null,
  },
  {
    name: 'blocks missing completion status',
    input: { hook_event_name: 'Stop', final_response: 'Tests pass.' },
    expect: /Missing completion status/,
  },
  {
    name: 'blocks missing completion status from Codex Stop payload',
    input: { hook_event_name: 'Stop', last_assistant_message: 'Tests pass.' },
    expect: /"decision":"block"[\s\S]*Missing completion status/,
  },
  {
    name: 'skips block advisory Stop with turn_id and no file edits',
    input: { hook_event_name: 'Stop', turn_id: 'eval-advisory', last_assistant_message: 'Run pipx install to fix it.' },
    expectEqual: null,
  },
  {
    name: 'blocks Stop after file edits when status missing',
    setup: () => markTurnEdited('eval-task'),
    teardown: () => clearTurnEdited('eval-task'),
    input: { hook_event_name: 'Stop', turn_id: 'eval-task', last_assistant_message: 'Fixed the bug.' },
    expect: /"decision":"block"[\s\S]*Missing completion status/,
  },
  {
    name: 'stays silent for allowed Stop payloads',
    input: { hook_event_name: 'Stop' },
    expectEqual: null,
  },
  {
    name: 'warns on failed camelCase tool response',
    input: { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { exitCode: 1 } },
    expect: /recover/,
  },
  {
    name: 'routes repeated-failure prompt to recover',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'This hook keeps failing after three patches' },
    expect: /"hookEventName":"UserPromptSubmit"[\s\S]*Use `recover`/,
  },
  {
    name: 'does not route plain release wording to review',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Release the hook package' },
    expectEqual: null,
  },
  {
    name: 'routes ready-to-ship review language',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Ready to ship after code review' },
    expect: /"hookEventName":"UserPromptSubmit"[\s\S]*Use `review`/,
  },
  {
    name: 'does not restore memory for generic context wording',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Continue with the current session context' },
    expectEqual: null,
  },
  {
    name: 'routes explicit memory handoff to remember',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Restore memory.md for this handoff' },
    expect: /"hookEventName":"UserPromptSubmit"[\s\S]*Use `remember`/,
  },
  {
    name: 'blocks status that is not the final line',
    input: { hook_event_name: 'Stop', last_assistant_message: 'DONE\nTests pass.' },
    expect: /Missing completion status/,
  },
  {
    name: 'allows status on the final line',
    input: { hook_event_name: 'Stop', last_assistant_message: 'Tests pass.\nDONE' },
    expectEqual: null,
  },
  {
    name: 'marks mutating shell edits for Stop enforcement',
    setup: () => clearTurnEdited('eval-shell'),
    teardown: () => clearTurnEdited('eval-shell'),
    input: {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      turn_id: 'eval-shell',
      tool_input: { command: 'sed -i s/a/b/ file.txt' },
      tool_response: { exit_code: 0 },
    },
    expectEqual: null,
    after: () => {
      const blocked = buildHookResponse({
        hook_event_name: 'Stop',
        turn_id: 'eval-shell',
        last_assistant_message: 'Updated file via sed.',
      });
      assert.equal(blocked.decision, 'block');
    },
  },
];

let passed = 0;

for (const testCase of cases) {
  if (typeof testCase.setup === 'function') testCase.setup();
  let response;
  try {
    response = buildHookResponse(testCase.input);
    if (typeof testCase.after === 'function') testCase.after(response);
  } finally {
    if (typeof testCase.teardown === 'function') testCase.teardown();
  }
  if (Object.hasOwn(testCase, 'expectEqual')) {
    assert.deepEqual(response, testCase.expectEqual, testCase.name);
  } else {
    assert.match(JSON.stringify(response), testCase.expect, testCase.name);
  }
  passed += 1;
}

const score = passed / cases.length;
console.log(JSON.stringify({ passed, total: cases.length, score }, null, 2));

if (score < 1) {
  process.exitCode = 1;
}
