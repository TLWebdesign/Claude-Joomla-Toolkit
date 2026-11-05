#!/usr/bin/env node
// Log in to the Joomla administrator once and keep the session in .auth/state.json (0600).
// Credentials come from JOOMLA_MANUAL_USER / JOOMLA_MANUAL_PASS, from .auth/login.env (two lines,
// JOOMLA_MANUAL_USER=... and JOOMLA_MANUAL_PASS=..., 0600 and git-ignored), or are asked with hidden
// input when run in a terminal. The password never has to pass through the conversation.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { chromium } from 'playwright';
import { ADMIN, CHANNEL, STATE, VIEW } from './shoot.mjs';

const ENV_FILE = path.join(path.dirname(STATE), 'login.env');

function ask(question, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); };
    }
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); });
  });
}

function readEnvFile(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

const saved = readEnvFile(ENV_FILE);
let user = process.env.JOOMLA_MANUAL_USER || saved.JOOMLA_MANUAL_USER;
let pass = process.env.JOOMLA_MANUAL_PASS || saved.JOOMLA_MANUAL_PASS;
if (!user || !pass) {
  if (!process.stdin.isTTY) {
    console.error(`Set JOOMLA_MANUAL_USER and JOOMLA_MANUAL_PASS, put them in ${ENV_FILE}, or run this in a terminal to be asked.`);
    process.exit(1);
  }
  user = user || await ask('Joomla username: ');
  pass = pass || await ask('Password (hidden): ', true);
}

const browser = await chromium.launch({ channel: CHANNEL });
const ctx = await browser.newContext({ viewport: VIEW });
const page = await ctx.newPage();
await page.goto(ADMIN);
await page.fill('#mod-login-username', user);
await page.fill('#mod-login-password', pass);
await Promise.all([page.waitForLoadState('networkidle'), page.click('#btn-login-submit')]);
await page.waitForTimeout(1000);

if (await page.locator('#mod-login-username').count()) {
  const msg = await page.locator('joomla-alert, .alert').allInnerTexts().catch(() => []);
  console.error('Login failed.', msg.join(' ').replace(/\s+/g, ' '));
  await browser.close();
  process.exit(1);
}

fs.mkdirSync(path.dirname(STATE), { recursive: true, mode: 0o700 });
await ctx.storageState({ path: STATE });
fs.chmodSync(STATE, 0o600);

// Report what this account can reach, so the manual matches the client's permissions.
const menu = await page.$$eval('#sidebarmenu nav .item-level-1 > a', els => els.map(e => e.getAttribute('aria-label')).filter(Boolean));
// The System dashboard link is language independent; a client account should not have it
const superUser = await page.locator('#sidebarmenu a[href*="dashboard=system"]').count();
console.log('Logged in as', user);
console.log('Admin menu:', menu.join(', '));
if (superUser) console.log('Warning: this account sees the System menu, so it probably has more rights than the client.');
await browser.close();
