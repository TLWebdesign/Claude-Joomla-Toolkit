#!/usr/bin/env node
// Build the manual: content.cjs -> .docx -> .pdf, twice, so the table of contents gets the page
// numbers of the first PDF. Then renders contact sheets (8 pages each) to out/preview for review.
//
//   node make.mjs            build docx + pdf
//   node make.mjs --no-pdf   only build the docx

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WORK = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(WORK, 'manual.config.json'), 'utf8'));
const OUT = path.join(WORK, 'out');
const NAME = CONFIG.fileName || 'Manual';
const DOCX = path.join(OUT, NAME + '.docx');
const PDF = path.join(OUT, NAME + '.pdf');
const PY = path.join(WORK, '.venv', 'bin', 'python');

fs.mkdirSync(OUT, { recursive: true });

function buildDocx() {
  execFileSync(process.execPath, [path.join(WORK, 'content.cjs')], { stdio: 'inherit', cwd: WORK });
}

// Word (macOS) gives the best result; LibreOffice is the fallback.
function toPdf() {
  const word = '/Applications/Microsoft Word.app';
  if (process.platform === 'darwin' && fs.existsSync(word) && !process.env.MANUAL_USE_LIBREOFFICE) {
    // Word is sandboxed: work inside its container to avoid file access prompts.
    const dir = path.join(os.homedir(), 'Library/Containers/com.microsoft.Word/Data/Documents/joomla-manual');
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, 'manual.docx');
    const dst = path.join(dir, 'manual.pdf');
    fs.copyFileSync(DOCX, src);
    fs.rmSync(dst, { force: true });
    const script = `tell application "Microsoft Word"
  open POSIX file "${src}"
  delay 3
  set d to active document
  save as d file name "${dst}" file format format PDF
  close d saving no
end tell`;
    const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
    if (r.status !== 0 || !fs.existsSync(dst)) throw new Error('Word could not export the PDF: ' + r.stderr);
    fs.copyFileSync(dst, PDF);
    return;
  }
  const soffice = ['soffice', 'libreoffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']
    .find(bin => spawnSync(bin, ['--version']).status === 0);
  if (!soffice) throw new Error('Neither Microsoft Word nor LibreOffice is available to make the PDF.');
  execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', OUT, DOCX], { stdio: 'inherit' });
}

function scanPages(previews) {
  const args = [path.join(WORK, 'pages.py'), PDF, path.join(OUT, 'chapters.json'), path.join(OUT, 'pages.json')];
  if (previews) args.push(path.join(OUT, 'preview'));
  const r = spawnSync(PY, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('pages.py failed: ' + r.stderr);
  return JSON.parse(r.stdout);
}

fs.rmSync(path.join(OUT, 'pages.json'), { force: true });
buildDocx();
if (process.argv.includes('--no-pdf')) process.exit(0);
toPdf();
const first = scanPages(false);
buildDocx();
toPdf();
const second = scanPages(true);
const stable = JSON.stringify(first.pages) === JSON.stringify(second.pages);
if (!stable) {
  // Page numbers only take a line each, so a third pass practically never changes anything.
  buildDocx();
  toPdf();
  scanPages(true);
}
console.log(`PDF: ${PDF} (${second.pageCount} pages)`);
if (second.missing.length) console.log('Headings not found in the PDF:', second.missing.join(' | '));
console.log('Contact sheets: ' + path.join(OUT, 'preview'));
