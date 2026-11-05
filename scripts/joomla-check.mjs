#!/usr/bin/env node
// Read-only health check for a linked site: the API token, the API user and the MCP server.
//
//   joomla-check [--site <alias>]

import { api, mcpConnect, resolveSite } from './joomla-site.mjs';

// Options can be saved with an empty PHP CLI path and article deletes are verified since this version
const MIN_SERVER_VERSION = '1.0.4';

const aliasIndex = process.argv.indexOf('--site');
let failed = false;

try {
  const site = resolveSite(aliasIndex > -1 ? process.argv[aliasIndex + 1] : undefined);
  console.log(`Site ${site.alias}: ${site.baseUrl}`);

  await step('Web Services API and token', async () => {
    const list = await api(site, 'GET', 'content/articles?page[limit]=1');
    return `ok, ${list?.meta?.['total-pages'] ?? '?'} article(s) visible`;
  });

  await step('API user', async () => {
    const userId = Buffer.from(site.token, 'base64').toString('utf8').split(':')[1];

    if (!/^\d+$/.test(userId ?? '')) {
      throw new Error('the stored token is not a Joomla API token (copy it from the Joomla API Token tab of the API user)');
    }

    const user = (await api(site, 'GET', `users/${userId}`)).data.attributes;
    return `${user.name} (${user.username}, id ${userId})`;
  });

  await step('MCP server', async () => {
    const mcp = await mcpConnect(site);
    let tools = 0;
    let cursor;

    do {
      const page = await mcp.request('tools/list', cursor ? { cursor } : {});
      tools += page.tools.length;
      cursor = page.nextCursor;
    } while (cursor);

    const sites = await mcp.call('joomla_sites_list', {});
    const articles = await mcp.call('joomla_content_articles_list', { limit: 1 });

    if (articles.status && articles.status !== 200) {
      throw new Error(`article read returned HTTP ${articles.status}`);
    }

    const notes = [];

    if (compareVersions(mcp.server.version, MIN_SERVER_VERSION) < 0) {
      notes.push(`update the JoomEngine MCP package on the site to ${MIN_SERVER_VERSION} or later`);
    }

    if (sites.defaultSite !== site.alias) {
      notes.push(`the component's site alias is "${sites.defaultSite}", leave out the "site" argument in tool calls`);
    }

    return `ok, ${mcp.server.name} ${mcp.server.version}, ${tools} tools${notes.map((note) => `\n${' '.repeat(33)}note: ${note}`).join('')}`;
  });

  console.log('\nReminder: the API user needs a time zone that is UTC+0 all year, such as Atlantic/Reykjavik');
  console.log('(Users > edit > Basic Settings; there is no plain UTC option, and London or Dublin use summer time),');
  console.log('otherwise every API update moves article dates by the site time zone offset.');
} catch (error) {
  console.error(`joomla-check: ${error.message}`);
  failed = true;
}

process.exit(failed ? 1 : 0);

async function step(label, action) {
  try {
    console.log(`  ${label.padEnd(30)} ${await action()}`);
  } catch (error) {
    console.log(`  ${label.padEnd(30)} FAILED: ${error.message}`);
    failed = true;
  }
}

function compareVersions(a, b) {
  const [left, right] = [a, b].map((version) => String(version).split('.').map((part) => parseInt(part, 10) || 0));

  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) {
      return (left[i] ?? 0) - (right[i] ?? 0);
    }
  }

  return 0;
}
