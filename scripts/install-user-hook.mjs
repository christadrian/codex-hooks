#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createUserHookCommand,
  hasAnyHooks,
  mergeHooksToml,
  removeCommandFromHooksConfig,
  writeFileAtomic,
} from '../src/hook-utils.mjs';

const repoPath = path.resolve(new URL('..', import.meta.url).pathname);
const codexDir = path.join(os.homedir(), '.codex');
const hooksPath = path.join(codexDir, 'hooks.json');
const configPath = path.join(codexDir, 'config.toml');

fs.mkdirSync(codexDir, { recursive: true });

const existingToml = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
const nextToml = mergeHooksToml(existingToml, repoPath);
writeFileAtomic(configPath, nextToml);

let legacyMessage = 'No legacy ~/.codex/hooks.json migration needed';

if (fs.existsSync(hooksPath)) {
  const existingHooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const migratedHooks = removeCommandFromHooksConfig(existingHooks, createUserHookCommand(repoPath));

  if (hasAnyHooks(migratedHooks)) {
    writeFileAtomic(hooksPath, `${JSON.stringify(migratedHooks, null, 2)}\n`);
    legacyMessage = 'Removed migrated JavaScript-Mastery-Pro hooks from legacy ~/.codex/hooks.json';
  } else {
    fs.unlinkSync(hooksPath);
    legacyMessage = 'Removed legacy ~/.codex/hooks.json after migrating JavaScript-Mastery-Pro hooks';
  }
}

console.log(`Installed JavaScript-Mastery-Pro Codex hooks to ${configPath}`);
console.log(legacyMessage);
