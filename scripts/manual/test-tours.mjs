#!/usr/bin/env node
// Walk through guided tours as the logged-in test account and report every step that does not
// attach to its target. Screenshots of each step go to tourtest/<tour>-<step>.png.
// Never saves: forms are cancelled and the image editor is closed at the end of each tour.
//
//   node test-tours.mjs                       all tours in ../tours/tours.json
//   node test-tours.mjs mysite-welkom         one tour (uid)
//   node test-tours.mjs --file path/tours.json
//
// Per step, an optional "test" object in tours.json says what to do before clicking Next:
//   { "fill": "60" }  { "select": "3:2" }  { "choose": "Blog" } (fancy-select, reloads the form)
// Without it: button steps click the target, text steps type "Test", other steps click the target.

import fs from 'node:fs';
import { launch, closeEdit, checkedOut, ADMIN } from './shoot.mjs';

const args = process.argv.slice(2);
const fi = args.indexOf('--file');
const file = fi >= 0 ? args[fi + 1] : '../tours/tours.json';
const only = args.filter((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1));
const tours = JSON.parse(fs.readFileSync(file, 'utf8')).tours;
const T = { 0: 'next', 1: 'redirect', 2: 'interactive' };
const I = { 1: 'submit', 2: 'text', 3: 'other', 4: 'button', 5: 'checkbox_radio', 6: 'select' };
const typeOf = s => T[s.type] ?? s.type ?? 'next';
const itypeOf = s => I[s.interactive_type] ?? s.interactive_type ?? 'submit';

fs.mkdirSync('tourtest', { recursive: true });
const { browser, page } = await launch();
page.on('dialog', d => d.accept().catch(() => {}));
const popup = '.shepherd-element:visible'; // old, hidden step elements stay in the DOM
const problems = [];

try {
  for (const [ti, tour] of tours.entries()) {
    if (only.length && !only.includes(tour.uid)) continue;
    console.log('\n==', tour.title);
    await page.goto(ADMIN); await page.waitForLoadState('networkidle');
    // Start the tour the way the "Doe een rondleiding" menu does
    await page.evaluate(uid => {
      const b = document.createElement('button');
      b.className = 'button-start-guidedtour'; b.dataset.gtUid = uid; document.body.appendChild(b); b.click();
    }, tour.uid);

    for (let i = 0; i <= tour.steps.length; i++) {
      await page.waitForSelector('.shepherd-element >> visible=true', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(900);
      const shown = await page.locator(`${popup} .shepherd-title`).first().innerText().catch(() => '(no step visible)');
      const st = i === 0 ? { title: tour.title, target: '' } : tour.steps[i - 1];
      const exists = st.target ? await page.locator(st.target).count().catch(() => 0) : 1;
      const attached = st.target
        ? await page.evaluate(sel => document.querySelector(sel)?.classList.contains('shepherd-target') ?? false, st.target).catch(() => false)
        : true;
      const bad = !exists || !attached || shown.replace(/\s+/g, ' ').trim() !== st.title.trim();
      console.log(`${String(i).padStart(2)}. ${shown.replace(/\s+/g, ' ')} | ${st.target || '-'}${bad ? '   <-- CHECK' : ''}`);
      if (bad) problems.push(`${tour.uid} step ${i} "${st.title}": shown "${shown}", target exists=${exists} attached=${attached}`);
      await page.screenshot({ path: `tourtest/${ti + 1}-${String(i).padStart(2, '0')}.png` });
      if (i === tour.steps.length || shown === '(no step visible)') break;

      if (i > 0 && typeOf(st) === 'interactive') {
        const it = itypeOf(st), test = st.test || {};
        if (it === 'button' || it === 'submit') {
          await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.locator(st.target).first().click()]);
          await page.waitForTimeout(1500);
          continue; // the click itself moves the tour on
        }
        if (test.select) await page.selectOption(st.target, { label: test.select });
        else if (test.choose) {
          await page.locator(st.target).first().click(); await page.waitForTimeout(400);
          await Promise.all([page.waitForNavigation().catch(() => {}),
            page.locator('.choices__item--choice', { hasText: test.choose }).first().click()]);
          await page.waitForTimeout(2500);
        } else if (it === 'text') {
          const el = page.locator(st.target).first();
          const isNumber = (await el.getAttribute('type')) === 'number';
          await el.fill(test.fill ?? (isNumber ? (await el.inputValue()) || '1' : 'Test'));
        }
        else await page.locator(st.target).first().click();
        await page.waitForTimeout(500);
      }
      const next = page.locator(`${popup} .shepherd-button-primary`).first();
      if (!(await next.count())) { problems.push(`${tour.uid} step ${i}: no Next button`); break; }
      if (await next.isDisabled()) { problems.push(`${tour.uid} step ${i}: Next is disabled (required field empty?)`); break; }
      await next.click();
      await page.waitForTimeout(600);
    }

    await page.locator(`${popup} .shepherd-cancel-icon`).first().click().catch(() => {});
    if (page.url().includes('layout=edit')) await closeEdit(page).catch(() => {});
    if (page.url().includes('view=file')) {
      await Promise.all([page.waitForNavigation().catch(() => {}), page.locator('#toolbar-cancel button').click().catch(() => {})]);
    }
    await page.evaluate(() => sessionStorage.clear());
  }
} finally {
  if (page.url().includes('layout=edit')) await closeEdit(page).catch(() => {});
  const locked = await checkedOut(page);
  console.log('\nStill checked out:', locked.length ? locked : 'nothing');
  console.log(problems.length ? 'Problems:\n- ' + problems.join('\n- ') : 'All steps attached.');
  await browser.close();
}
