#!/usr/bin/env node
// Reads and sets custom field values on Joomla articles through the Web Services API. The JoomEngine MCP
// server sets field values itself; this helper shows the values that apply to one article.
//
//   joomla-fields list                               Article custom fields (name, type, state, title)
//   joomla-fields get <articleId>                    Custom field values of an article
//   joomla-fields set <articleId> --json '{...}'     Set values, keyed by field name
//   joomla-fields set <articleId> --file values.json
//
// Add --site <alias> outside a linked project. Only the given fields are sent, other article data is untouched.

import fs from 'node:fs';
import { api, apiList, resolveSite } from './joomla-site.mjs';

const args = parseArgs(process.argv.slice(2));
const [command, id] = args._;

try {
  const site = resolveSite(args.site);

  if (command === 'list') {
    await list(site);
  } else if (command === 'get') {
    await get(site, requireId(id));
  } else if (command === 'set') {
    await set(site, requireId(id), readValues(args));
  } else {
    throw new Error('Usage: joomla-fields list | get <articleId> | set <articleId> --json \'{...}\' | --file <path>');
  }
} catch (error) {
  console.error(`joomla-fields: ${error.message}`);
  process.exit(1);
}

async function list(site) {
  for (const field of await articleFields(site)) {
    const a = field.attributes;
    console.log(`${a.name.padEnd(32)} ${a.type.padEnd(16)} ${a.state === 1 ? 'published' : `state ${a.state}`}  ${a.title}`);
  }
}

async function get(site, articleId) {
  const names = (await articleFields(site)).map((field) => field.attributes.name);
  const article = (await api(site, 'GET', `content/articles/${articleId}`)).data.attributes;
  const values = Object.fromEntries(names.filter((name) => name in article).map((name) => [name, article[name]]));

  console.log(JSON.stringify({ id: articleId, title: article.title, fields: values }, null, 2));
}

async function set(site, articleId, values) {
  const known = new Set((await articleFields(site)).map((field) => field.attributes.name));
  const unknown = Object.keys(values).filter((name) => !known.has(name));

  if (unknown.length) {
    throw new Error(`Unknown article field(s): ${unknown.join(', ')}. Run "joomla-fields list" for the names.`);
  }

  const response = await api(site, 'PATCH', `content/articles/${articleId}`, values);
  const article = response.data.attributes;

  // Joomla silently skips fields that do not apply to the article (assigned to other categories, or only
  // used inside a subform). Those are missing from the response.
  const skipped = Object.keys(values).filter((name) => !(name in article));

  console.log(JSON.stringify({
    id: articleId,
    title: article.title,
    updated: Object.fromEntries(Object.keys(values).filter((name) => name in article).map((name) => [name, article[name]])),
  }, null, 2));

  if (skipped.length) {
    throw new Error(`Not saved, these fields do not apply to this article (assigned to other categories, or only used inside a subform): ${skipped.join(', ')}`);
  }
}

async function articleFields(site) {
  return apiList(site, 'fields/content/articles');
}

function readValues(options) {
  const raw = options.file ? fs.readFileSync(options.file, 'utf8') : options.json;

  if (!raw || raw === true) {
    throw new Error('Pass the values with --json \'{"field-name": "value"}\' or --file <path>.');
  }

  const values = JSON.parse(raw);

  if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) {
    throw new Error('The values must be a JSON object keyed by field name.');
  }

  return values;
}

function requireId(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1) {
    throw new Error('Give a positive article id.');
  }

  return number;
}

function parseArgs(list) {
  const result = { _: [] };

  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith('--')) {
      const [key, value] = list[i].slice(2).split(/=(.*)/s);
      result[key] = value ?? (list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true);
    } else {
      result._.push(list[i]);
    }
  }

  return result;
}
