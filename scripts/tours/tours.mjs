#!/usr/bin/env node
// Guided tours for a Joomla site, kept in a tours.json file in the project.
//
//   node tours.mjs init <folder> --prefix mysite- --ssh account@host --root domains/example.com/public_html
//   node tours.mjs validate [tours.json]  validate the file (no site access)
//   node tours.mjs check   [tours.json]   validate the file and do a dry run on the site (rolled back)
//   node tours.mjs install [tours.json]   (re)install all tours of the prefix
//   node tours.mjs remove  [tours.json]   remove all tours of the prefix
//
// Joomla has no Web Services route for guided tours, so install.php is copied to the account's
// home folder over SSH, run from the Joomla root and removed again.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [cmd, ...rest] = process.argv.slice(2);
const opt = name => { const i = rest.indexOf('--' + name); return i >= 0 ? rest[i + 1] : undefined; };
const positional = rest.find((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));

const TYPES = ['next', 'redirect', 'interactive'];
const ITYPES = ['submit', 'text', 'other', 'button', 'checkbox_radio', 'select'];

function validate(data) {
  const errors = [];
  if (!/^[a-z0-9][a-z0-9-]*-$/.test(data.prefix || '')) errors.push('"prefix" must be lower case and end in a dash, for example "mysite-"');
  if (!data.ssh || !data.root) errors.push('"ssh" (account@host) and "root" (Joomla root, relative to the home folder) are required');
  for (const t of data.tours || []) {
    const where = t.uid || t.title;
    if (!t.uid?.startsWith(data.prefix)) errors.push(`${where}: uid must start with ${data.prefix}`);
    if (!t.url || t.url.startsWith('/') || t.url.startsWith('http')) errors.push(`${where}: url must be relative, like "administrator/index.php?option=com_content&view=articles"`);
    if (t.url === 'administrator/index.php?option=com_media') errors.push(`${where}: com_media redirects to "...&path=local-images:/"; use that as the url or the tour restarts forever`);
    if (!Array.isArray(t.extensions) || !t.extensions.length) errors.push(`${where}: "extensions" lists the components whose screens show this tour, for example ["com_content"]`);
    (t.steps || []).forEach((s, i) => {
      const at = `${where} step ${i + 1} (${s.title})`;
      const type = s.type ?? 'next';
      if (!TYPES.includes(type) && !Number.isInteger(type)) errors.push(`${at}: unknown type ${type}`);
      if (type === 'interactive') {
        if (!ITYPES.includes(s.interactive_type ?? 'submit')) errors.push(`${at}: unknown interactive_type ${s.interactive_type}`);
        if (!s.target) errors.push(`${at}: an interactive step needs a target`);
      }
      if (s.target && /:has-text|>>|text=/.test(s.target)) errors.push(`${at}: target must be plain CSS (document.querySelector), not a Playwright selector`);
      if (!s.description) errors.push(`${at}: description is empty`);
    });
  }
  return errors;
}

function load(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = validate(data);
  if (errors.length) { console.error(errors.map(e => '- ' + e).join('\n')); process.exit(1); }
  const steps = (data.tours || []).reduce((n, t) => n + (t.steps || []).length, 0);
  console.log(`${data.tours.length} tours, ${steps} steps, prefix ${data.prefix}`);
  return data;
}

function run(file, flag) {
  const data = load(file);
  const ssh = ['-o', 'BatchMode=yes', '-o', 'LogLevel=ERROR'];
  execFileSync('scp', ['-q', ...ssh, path.join(HERE, 'install.php'), `${data.ssh}:joomla-tours-install.php`], { stdio: 'inherit' });
  execFileSync('scp', ['-q', ...ssh, file, `${data.ssh}:joomla-tours.json`], { stdio: 'inherit' });
  const remote = `cd ${JSON.stringify(data.root)} && php ~/joomla-tours-install.php ~/joomla-tours.json ${flag}; s=$?; rm -f ~/joomla-tours-install.php ~/joomla-tours.json; exit $s`;
  execFileSync('ssh', [...ssh, data.ssh, remote], { stdio: 'inherit' });
}

// A folder stands for the tours.json inside it
let file = path.resolve(positional || 'tours.json');
if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'tours.json');
switch (cmd) {
  case 'init': {
    const dir = path.resolve(positional || 'tours');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(HERE, 'tours.mjs'), path.join(dir, 'tours.mjs'));
    fs.copyFileSync(path.join(HERE, 'install.php'), path.join(dir, 'install.php'));
    const target = path.join(dir, 'tours.json');
    if (!fs.existsSync(target)) {
      const starter = JSON.parse(fs.readFileSync(path.join(HERE, 'starter', 'tours.json'), 'utf8'));
      Object.assign(starter, {
        prefix: opt('prefix') || starter.prefix,
        ssh: opt('ssh') || starter.ssh,
        root: opt('root') || starter.root,
      });
      starter.tours.forEach(t => { t.uid = starter.prefix + t.uid.replace(/^.*?-/, ''); });
      fs.writeFileSync(target, JSON.stringify(starter, null, 2) + '\n');
      console.log('Created', target);
    }
    console.log('Tours folder ready:', dir);
    break;
  }
  case 'validate': load(file); console.log('Valid.'); break;
  case 'check': run(file, '--dry-run'); break;
  case 'install': run(file, ''); break;
  case 'remove': run(file, '--remove'); break;
  default:
    console.error('Usage: node tours.mjs init|validate|check|install|remove [file or folder] (see the header of this file)');
    process.exit(1);
}
