#!/usr/bin/env node
import { appendFileSync, chmodSync, mkdirSync, readFileSync, statSync, truncateSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHookResponse } from '../src/hook-utils.mjs';

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const input = readStdin().trim();
let payload = {};

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /token|secret|password|api[_-]?key|authorization|cookie/i.test(key) ? '[REDACTED]' : redact(item),
    ]),
  );
}

function debug(payloadValue) {
  if (process.env.CODEX_HOOKS_DEBUG !== '1') return;
  const dir = process.env.PLUGIN_DATA || path.join(os.tmpdir(), 'codex-jmp-hook-debug');
  const file = path.join(dir, 'hooks-debug.jsonl');
  mkdirSync(dir, { recursive: true });
  try {
    if (statSync(file).size > 1024 * 1024) truncateSync(file);
  } catch {
    /* first write */
  }
  appendFileSync(file, `${JSON.stringify(redact(payloadValue))}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

try {
  payload = input ? JSON.parse(input) : {};
} catch {
  payload = null;
}

if (payload === null) {
  process.exit(0);
}

debug(payload);

const response = buildHookResponse(payload);

if (response !== null) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
