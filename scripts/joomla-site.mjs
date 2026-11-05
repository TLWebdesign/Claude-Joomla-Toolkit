// Shared helpers: find the Joomla site for the current project, call its Web Services API and talk to
// the JoomEngine MCP endpoint on that site.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONF = process.env.JOOMLA_TOOLKIT_CONFIG || path.join(os.homedir(), '.config', 'joomla-mcp');
export const MCP_ROUTE = 'api/index.php/v1/joomengine-mcp';

/**
 * Read the base URL from a site config. Configs written before 0.3.0 use the format of the TypeScript
 * joomengine server (sites.<alias>.api.baseUrl).
 */
export function siteBaseUrl(config, alias) {
  return config?.baseUrl ?? config?.sites?.[alias]?.api?.baseUrl ?? null;
}

/**
 * Resolve the site alias from --site, or from .claude/joomla-site.json in this folder or a parent folder.
 */
export function resolveSite(explicitAlias) {
  let alias = explicitAlias;

  if (!alias) {
    for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
      const file = path.join(dir, '.claude', 'joomla-site.json');

      if (fs.existsSync(file)) {
        alias = JSON.parse(fs.readFileSync(file, 'utf8')).alias;
        break;
      }

      if (dir === path.dirname(dir)) {
        break;
      }
    }
  }

  if (!alias) {
    throw new Error('No site found. Run this inside a linked project or pass --site <alias>.');
  }

  const configFile = path.join(CONF, 'sites', `${alias}.json`);
  const tokenFile = path.join(CONF, 'tokens', alias);

  if (!fs.existsSync(configFile)) {
    throw new Error(`Site "${alias}" is not configured (${configFile} is missing).`);
  }

  if (!fs.existsSync(tokenFile)) {
    throw new Error(`No API token stored for "${alias}". Run "joomla-toolkit set-token ${alias}".`);
  }

  const baseUrl = siteBaseUrl(JSON.parse(fs.readFileSync(configFile, 'utf8')), alias);

  if (!baseUrl) {
    throw new Error(`${configFile} has no base URL. Run "joomla-toolkit add-site ${alias} --url <url>".`);
  }

  return {
    alias,
    baseUrl,
    token: fs.readFileSync(tokenFile, 'utf8').trim(),
  };
}

/**
 * Call the Joomla Web Services API. Returns the decoded JSON body, or null for an empty body.
 */
export async function api(site, method, route, body) {
  const response = await fetch(`${site.baseUrl}/api/index.php/v1/${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${site.token}`,
      Accept: 'application/vnd.api+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON, reported below when the status is an error
  }

  if (!response.ok) {
    const detail = json?.errors?.map((error) => error.title).join('; ') || text.slice(0, 300);
    throw new Error(`Joomla API ${method} ${route} returned HTTP ${response.status}: ${detail}`);
  }

  return json;
}

/**
 * Read all pages of a list route.
 */
export async function apiList(site, route) {
  const items = [];

  for (let offset = 0; ; offset += 100) {
    const separator = route.includes('?') ? '&' : '?';
    const page = await api(site, 'GET', `${route}${separator}page[offset]=${offset}&page[limit]=100`);
    items.push(...(page?.data ?? []));

    if (!page?.links?.next) {
      return items;
    }
  }
}

/**
 * Open an MCP session (Streamable HTTP) on the site's JoomEngine MCP endpoint.
 */
export async function mcpConnect(site) {
  const endpoint = `${site.baseUrl}/${MCP_ROUTE}`;
  let sessionId = null;
  let nextId = 0;

  const send = async (message) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-Joomla-Token': site.token,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...message }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`MCP endpoint returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    sessionId = response.headers.get('mcp-session-id') ?? sessionId;

    if (!text.trim()) {
      return null;
    }

    // A Streamable HTTP server may answer with JSON or with a single server-sent event
    const body = (response.headers.get('content-type') ?? '').includes('text/event-stream')
      ? text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5)).join('')
      : text;

    return JSON.parse(body);
  };

  const request = async (method, params) => {
    const message = await send({ id: ++nextId, method, params });

    if (message?.error) {
      throw new Error(message.error.message);
    }

    return message?.result;
  };

  const call = async (name, args) => {
    const result = await request('tools/call', { name, arguments: args });
    const text = result.content.map((part) => part.text).join('');

    if (result.isError) {
      throw new Error(text.slice(0, 300));
    }

    return JSON.parse(text);
  };

  const info = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'joomla-toolkit', version: '1' },
  });
  await send({ method: 'notifications/initialized' });

  return { request, call, server: info.serverInfo };
}
