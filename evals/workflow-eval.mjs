#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildHookResponse } from '../src/hook-utils.mjs';

const cases = [
  {
    name: 'routes new UI work to architect and imprint',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Create a settings card component' },
    expect: /"hookEventName":"UserPromptSubmit"[\s\S]*Use `architect`[\s\S]*Use `imprint`/,
  },
  {
    name: 'warns after UI patch',
    input: {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: { patch: '*** Add File: components/SettingsCard.tsx' },
    },
    expect: /"hookEventName":"PostToolUse"[\s\S]*Run `\/imprint`/,
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
    name: 'routes debug prompt to recover',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Debug this failing hook' },
    expect: /"hookEventName":"UserPromptSubmit"[\s\S]*Use `recover`/,
  },
  {
    name: 'routes release prompt to review',
    input: { hook_event_name: 'UserPromptSubmit', prompt: 'Release the hook package' },
    expect: /"hookEventName":"UserPromptSubmit"[\s\S]*Use `review`/,
  },
];

let passed = 0;

for (const testCase of cases) {
  const response = buildHookResponse(testCase.input);
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
