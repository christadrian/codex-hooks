#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUserHookConfig, mergeHooksConfig } from '../src/hook-utils.mjs';

const repoPath = path.resolve(new URL('..', import.meta.url).pathname);
const codexDir = path.join(os.homedir(), '.codex');
const hooksPath = path.join(codexDir, 'hooks.json');

fs.mkdirSync(codexDir, { recursive: true });

const existing = fs.existsSync(hooksPath)
  ? JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
  : {};

const next = mergeHooksConfig(existing, createUserHookConfig(repoPath));
fs.writeFileSync(hooksPath, `${JSON.stringify(next, null, 2)}\n`);

console.log(`Installed JavaScript-Mastery-Pro Codex hooks to ${hooksPath}`);
