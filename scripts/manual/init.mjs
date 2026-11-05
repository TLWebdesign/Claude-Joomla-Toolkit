#!/usr/bin/env node
// Create or refresh a manual work folder: copies the helpers, installs Playwright, docx and PyMuPDF,
// and writes starter files (config, content.cjs, a capture example) when they do not exist yet.
//
//   node init.mjs <folder> --url https://www.example.com [--lang nl] [--name "Website manual"]
//
// --lang (en, nl, de, fr; default en) sets the browser locale, the default file name and the label
// of the table of contents. The text of the manual itself is whatever content.cjs says.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const dir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!dir) { console.error('Usage: node init.mjs <folder> --url https://www.example.com [--lang nl] [--name "Title"]'); process.exit(1); }

const LANGS = {
  en: { locale: 'en-GB', name: 'Website manual', toc: 'Contents' },
  nl: { locale: 'nl-NL', name: 'Handleiding websitebeheer', toc: 'Inhoud' },
  de: { locale: 'de-DE', name: 'Handbuch Website', toc: 'Inhalt' },
  fr: { locale: 'fr-FR', name: 'Guide du site web', toc: 'Sommaire' },
};
const slug = name => name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

const WORK = path.resolve(dir);
fs.mkdirSync(path.join(WORK, 'shots'), { recursive: true });
fs.mkdirSync(path.join(WORK, 'out'), { recursive: true });

// Helpers are always refreshed; files the user or Claude edits are only created once.
for (const f of ['shoot.mjs', 'login.mjs', 'doc.cjs', 'make.mjs', 'pages.py', 'logo.mjs', 'test-tours.mjs', 'checkin.mjs']) {
  fs.copyFileSync(path.join(HERE, f), path.join(WORK, f));
}
const once = (name, content) => {
  const f = path.join(WORK, name);
  if (!fs.existsSync(f)) { fs.writeFileSync(f, content); console.log('Created', name); }
};
for (const f of fs.readdirSync(path.join(HERE, 'starter'))) {
  once(f, fs.readFileSync(path.join(HERE, 'starter', f), 'utf8'));
}

const configFile = path.join(WORK, 'manual.config.json');
const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
const url = opt('url') || config.siteUrl;
if (!url) { console.error('Pass --url the first time.'); process.exit(1); }
const lang = (opt('lang') || config.lang || 'en').toLowerCase();
const L = LANGS[lang] || { ...LANGS.en, locale: lang };
Object.assign(config, {
  siteUrl: url.replace(/\/+$/, ''),
  lang,
  fileName: opt('name') ? slug(opt('name')) : config.fileName || slug(L.name),
  viewport: config.viewport || { width: 1600, height: 1000 },
  scale: config.scale || 2,
  locale: config.locale || L.locale,
  colors: config.colors || {},
  labels: config.labels || { toc: L.toc },
});
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');

once('package.json', JSON.stringify({ name: 'joomla-manual', private: true, type: 'module' }, null, 2) + '\n');
once('.gitignore', ['.auth/', 'node_modules/', '.venv/', 'out/preview/', 'out/pages.json', 'out/chapters.json', 'tourtest/', ''].join('\n'));

const need = ['playwright', 'docx'].filter(m => !fs.existsSync(path.join(WORK, 'node_modules', m)));
if (need.length) {
  console.log('Installing', need.join(', '));
  execFileSync('npm', ['install', '--silent', ...need], { cwd: WORK, stdio: 'inherit' });
}

const py = path.join(WORK, '.venv', 'bin', 'python');
if (!fs.existsSync(py)) {
  execFileSync('python3', ['-m', 'venv', path.join(WORK, '.venv')], { stdio: 'inherit' });
}
if (spawnSync(py, ['-c', 'import pymupdf']).status !== 0) {
  console.log('Installing pymupdf');
  execFileSync(py, ['-m', 'pip', 'install', '-q', 'pymupdf'], { stdio: 'inherit' });
}

// Playwright drives the installed Google Chrome, so no separate browser download is needed.
const chrome = process.platform === 'darwin'
  ? fs.existsSync('/Applications/Google Chrome.app')
  : ['google-chrome', 'google-chrome-stable'].some(bin => spawnSync('which', [bin]).status === 0);
if (!chrome && (config.browserChannel || 'chrome') === 'chrome') {
  console.log('Google Chrome was not found. Install it, or set "browserChannel": "chromium" in manual.config.json and run "npx playwright install chromium" in this folder.');
}

console.log('Manual folder ready:', WORK);
