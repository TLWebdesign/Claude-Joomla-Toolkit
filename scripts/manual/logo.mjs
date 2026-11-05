#!/usr/bin/env node
// Save the site logo as shots/logo.png for the cover page. SVG logos are rendered sharp at 4x.
//   node logo.mjs <file or URL of the logo>

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { CHANNEL, SHOTS, SITE } from './shoot.mjs';

const src = process.argv[2];
if (!src) { console.error('Usage: node logo.mjs <file or URL>'); process.exit(1); }

const url = /^https?:/.test(src) ? src : src.startsWith('/') && !fs.existsSync(src) ? SITE + src : null;
const data = url ? Buffer.from(await (await fetch(url)).arrayBuffer()) : fs.readFileSync(src);
const isSvg = /\.svg(\?|$)/i.test(src) || data.subarray(0, 200).toString().includes('<svg');
const mime = isSvg ? 'image/svg+xml' : /\.png(\?|$)/i.test(src) ? 'image/png' : 'image/jpeg';

const browser = await chromium.launch({ channel: CHANNEL });
const page = await browser.newPage({ deviceScaleFactor: 4 });
await page.setContent(`<html><body style="margin:0;background:transparent">
  <img id="lg" style="width:600px;height:auto;display:block" src="data:${mime};base64,${data.toString('base64')}"></body></html>`);
await page.locator('#lg').screenshot({ path: path.join(SHOTS, 'logo.png'), omitBackground: true });
await browser.close();
console.log('Saved', path.join(SHOTS, 'logo.png'));
