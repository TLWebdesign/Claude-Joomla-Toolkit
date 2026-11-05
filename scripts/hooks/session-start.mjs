#!/usr/bin/env node
// SessionStart hook of the Joomla Toolkit plugin.
//
// In a project that is linked to a Joomla site (.claude/joomla-site.json in the project or a parent
// folder) it tells Claude which site that is, and keeps the helpers in ~/.config/joomla-mcp/bin in
// step with the plugin: after a plugin update they are copied again, so nobody has to remember
// "joomla-toolkit install". In every other project it exits at once without output. It never
// blocks a session: every failure is swallowed and the exit code is always 0.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONF = process.env.JOOMLA_TOOLKIT_CONFIG || path.join(os.homedir(), '.config', 'joomla-mcp');
const TOOLKIT = path.join(PLUGIN, 'scripts', 'joomla-toolkit.mjs');

try {
  const input = readInput();
  const siteFile = findUp(input.cwd || process.cwd(), path.join('.claude', 'joomla-site.json'));

  if (siteFile) {
    const site = JSON.parse(fs.readFileSync(siteFile, 'utf8'));
    const version = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version;
    const notes = [];

    if (!fs.existsSync(path.join(CONF, 'sites', `${site.alias}.json`))) {
      notes.push(`site "${site.alias}" is not configured on this machine, run /joomla-toolkit:setup`);
    } else {
      const stamp = path.join(CONF, 'bin', 'VERSION');
      const installed = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : null;

      if (installed !== version) {
        const result = spawnSync(process.execPath, [TOOLKIT, 'install'], { encoding: 'utf8', timeout: 8000 });
        notes.push(result.status === 0
          ? `helpers updated to ${version}`
          : `helpers are ${installed ?? 'missing'} and could not be updated to ${version}, run: node "${TOOLKIT}" install`);
      }

      if (!fs.existsSync(path.join(CONF, 'tokens', site.alias))) {
        notes.push('no API token stored, run /joomla-toolkit:setup');
      }
    }

    console.log(`Joomla Toolkit: this project is linked to the Joomla site "${site.alias}" (${site.url})${notes.length ? '; ' + notes.join('; ') : ''}.`);
  }
} catch {
  // A hook must never get in the way of the session
}

process.exit(0);

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function findUp(start, relative) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    const file = path.join(dir, relative);

    if (fs.existsSync(file)) {
      return file;
    }

    if (dir === path.dirname(dir)) {
      return null;
    }
  }
}
