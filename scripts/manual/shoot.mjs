// Screenshot helpers for Joomla manuals: a logged-in browser, numbered red marks, clipped shots.
// Copied into the manual work folder by init.mjs; capture scripts import it from there.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const WORK = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(WORK, 'manual.config.json'), 'utf8'));

export const SITE = CONFIG.siteUrl.replace(/\/+$/, '');
export const ADMIN = SITE + '/administrator/index.php';
// 1600 x 1000 keeps tables readable; smaller viewports wrap titles over several lines
export const VIEW = CONFIG.viewport || { width: 1600, height: 1000 };
export const STATE = path.join(WORK, '.auth', 'state.json');
// Playwright drives the installed Google Chrome; set "browserChannel": "chromium" in manual.config.json
// (and run "npx playwright install chromium") on a machine without Chrome
export const CHANNEL = CONFIG.browserChannel || 'chrome';
export const SHOTS = path.join(WORK, 'shots');

fs.mkdirSync(SHOTS, { recursive: true });

export async function launch({ loggedIn = true } = {}) {
  if (loggedIn && !fs.existsSync(STATE)) {
    throw new Error('Not logged in. Run "node login.mjs" in the manual folder first.');
  }
  const browser = await chromium.launch({ channel: CHANNEL });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: CONFIG.scale || 2,
    locale: CONFIG.locale || 'nl-NL',
    ...(loggedIn ? { storageState: STATE } : {}),
  });
  const page = await ctx.newPage();
  if (loggedIn) {
    await page.goto(ADMIN);
    if (await page.locator('#mod-login-username').count()) {
      await browser.close();
      throw new Error('The saved session has expired. Run "node login.mjs" again.');
    }
  }
  return { browser, ctx, page };
}

// Open an article edit form and make the toolbar non-sticky so it does not cover the fields.
export async function openArticle(page, id) {
  await page.goto(ADMIN + (id ? '?option=com_content&task=article.edit&id=' + id : '?option=com_content&task=article.add'));
  await page.waitForLoadState('networkidle');
  if (!page.url().includes('layout=edit')) {
    throw new Error(`Could not open article ${id ?? '(new)'}: ${page.url()}`);
  }
  await unstick(page);
}

export async function unstick(page) {
  await page.addStyleTag({ content: '#subhead-container, .subhead { position: static !important; }' });
}

// Leave an edit form WITHOUT saving; this also checks the item in again.
export async function closeEdit(page, task = 'article.cancel') {
  await unmark(page);
  await Promise.all([page.waitForNavigation(), page.evaluate(t => Joomla.submitbutton(t), task)]);
}

export async function tab(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('tab', { name, exact: true }).first().click();
  await page.waitForTimeout(500);
}

// Scroll so that the locator sits `offset` px below the top of the viewport.
export async function scrollTo(page, loc, offset = 140) {
  const b = await loc.first().boundingBox();
  if (b) await page.evaluate(dy => window.scrollBy(0, dy), b.y - offset);
  await page.waitForTimeout(300);
}

// Draw red boxes with numbered circles. list: [[locator, label|null, { side: 'tl'|'tr', pad }], ...]
// Marks go into an open <dialog> when there is one, so they stay above modal content.
export async function mark(page, list) {
  await unmark(page);
  const boxes = [];
  for (const [loc, label, opts = {}] of list) {
    const b = await loc.first().boundingBox().catch(() => null);
    if (!b) { console.log('   ! no box for', label ?? loc.toString()); continue; }
    boxes.push({ ...b, label, pad: opts.pad ?? 5, side: opts.side ?? 'tl' });
  }
  await page.evaluate(boxes => {
    const host = document.querySelector('dialog[open]') || document.body;
    for (const b of boxes) {
      const d = document.createElement('div');
      d.className = 'zz-mark';
      Object.assign(d.style, {
        position: 'fixed', left: (b.x - b.pad) + 'px', top: (b.y - b.pad) + 'px',
        width: (b.width + 2 * b.pad) + 'px', height: (b.height + 2 * b.pad) + 'px',
        border: '3px solid #E5392B', borderRadius: '8px', zIndex: 2147483646, pointerEvents: 'none',
        boxShadow: '0 0 0 4px rgba(229,57,43,.18)', boxSizing: 'border-box',
      });
      host.appendChild(d);
      if (b.label) {
        const l = document.createElement('div');
        l.className = 'zz-mark';
        l.textContent = b.label;
        const left = b.side === 'tr' ? b.x + b.width + b.pad - 14 : b.x - b.pad - 14;
        Object.assign(l.style, {
          position: 'fixed', left: left + 'px', top: (b.y - b.pad - 14) + 'px',
          width: '28px', height: '28px', borderRadius: '50%', background: '#E5392B', color: '#fff',
          font: 'bold 16px/28px Arial, sans-serif', textAlign: 'center', zIndex: 2147483647,
          boxShadow: '0 1px 3px rgba(0,0,0,.35)', pointerEvents: 'none',
        });
        host.appendChild(l);
      }
    }
  }, boxes);
}

export async function unmark(page) {
  await page.evaluate(() => document.querySelectorAll('.zz-mark').forEach(e => e.remove())).catch(() => {});
}

// Screenshot of the viewport. clip: a rectangle, or an array of locators whose union (+24px) is kept.
export async function shot(page, name, clip) {
  let c;
  if (Array.isArray(clip)) {
    const bs = [];
    for (const l of clip) { const b = await l.first().boundingBox(); if (b) bs.push(b); }
    const pad = 24;
    const x = Math.max(0, Math.min(...bs.map(b => b.x)) - pad);
    const y = Math.max(0, Math.min(...bs.map(b => b.y)) - pad);
    const r = Math.min(VIEW.width, Math.max(...bs.map(b => b.x + b.width)) + pad);
    const btm = Math.min(VIEW.height, Math.max(...bs.map(b => b.y + b.height)) + pad);
    c = { x, y, width: r - x, height: btm - y };
  } else if (clip) c = clip;
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), ...(c ? { clip: c } : {}) });
  console.log(' ✓', name);
}

// List items that are still checked out, so a crashed capture script can be cleaned up.
export async function checkedOut(page) {
  await page.goto(ADMIN + '?option=com_content&view=articles&list[limit]=0');
  await page.waitForLoadState('networkidle');
  const rows = page.locator('#articleList tbody tr').filter({ has: page.locator('.icon-checkedout') });
  return (await rows.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim().slice(0, 100));
}
