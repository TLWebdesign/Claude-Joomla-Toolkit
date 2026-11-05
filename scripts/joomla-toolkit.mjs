#!/usr/bin/env node
// Joomla Toolkit CLI: connects Joomla sites and projects to the JoomEngine MCP server, which runs on the
// Joomla site itself (package pkg_joomengine_mcp) and is reached over HTTP.
//
// Layout on this machine (override the root with JOOMLA_TOOLKIT_CONFIG):
//   ~/.config/joomla-mcp/
//     bin/                   helpers, copied from this plugin
//     templates/             the AGENTS.md section template
//     sites/<alias>.json     alias and base URL of one site
//     tokens/<alias>         Joomla API token for that site (0600)
//     headers/<alias>        prints the token header for Claude Code (0700)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs from the plugin (scripts/ and templates/ next to each other) or from the installed copy in
// <config>/bin (templates in <config>/templates)
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(SCRIPTS_DIR, '..', 'templates');
const CONF = process.env.JOOMLA_TOOLKIT_CONFIG || path.join(os.homedir(), '.config', 'joomla-mcp');
const MCP_ROUTE = 'api/index.php/v1/joomengine-mcp';
const ALIAS_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const BIN_FILES = ['joomla-fields.mjs', 'joomla-check.mjs', 'joomla-site.mjs', 'joomla-toolkit.mjs'];
// Version of the plugin these scripts belong to (plugin.json next to scripts/, or the VERSION stamp
// that install writes next to the installed copy)
const VERSION = readVersion();

// MCP tools that only read or prepare a plan. Grants and applies keep prompting.
const ALLOWED_TOOLS = [
  'sites_list', 'capabilities', 'actions_search', 'action_describe', 'action_read',
  'permissions_list', 'content_articles_list', 'content_article_get', 'extensions_list',
  'application_config_get_safe', 'action_write_plan', 'content_article_create_plan',
  'content_article_update_plan', 'content_article_delete_plan', 'permission_request',
].map((tool) => `mcp__joomla__joomla_${tool}`);

const MARKER_START = '<!-- joomla-toolkit:start -->';
const MARKER_END = '<!-- joomla-toolkit:end -->';

const commands = {
  install: cmdInstall,
  'add-site': cmdAddSite,
  'set-token': cmdSetToken,
  'link-project': cmdLinkProject,
  'list-sites': cmdListSites,
  status: cmdStatus,
  help: cmdHelp,
};

const [name, ...rest] = process.argv.slice(2);
const command = commands[name ?? 'help'];

if (!command) {
  fail(`Unknown command: ${name}. Run "joomla-toolkit help".`);
}

try {
  await command(parseArgs(rest));
} catch (error) {
  fail(error.message);
}

function cmdHelp() {
  console.log(`Usage: joomla-toolkit <command> [options]

  install                                 Install or update the helpers on this machine
  add-site <alias> --url <https://...>    Create or update the config for one site
  set-token <alias>                       Store the API token for a site (reads it without echo)
  link-project <alias> [--dir <project>]  Connect a project folder to a site
  list-sites                              List configured sites
  status [<alias>]                        Show what is installed and configured`);
}

async function cmdInstall() {
  const [major] = process.versions.node.split('.').map(Number);

  if (major < 20) {
    throw new Error(`The helpers need Node 20 or later, found ${process.versions.node}.`);
  }

  for (const name of ['', 'bin', 'templates', 'sites', 'tokens', 'headers']) {
    const dir = path.join(CONF, name);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
  }

  if (path.resolve(SCRIPTS_DIR) !== path.resolve(CONF, 'bin')) {
    for (const file of BIN_FILES) {
      const target = path.join(CONF, 'bin', file);
      fs.copyFileSync(path.join(SCRIPTS_DIR, file), target);
      fs.chmodSync(target, 0o755);
    }

    for (const file of fs.readdirSync(TEMPLATES_DIR)) {
      fs.copyFileSync(path.join(TEMPLATES_DIR, file), path.join(CONF, 'templates', file));
    }

    fs.writeFileSync(path.join(CONF, 'bin', 'VERSION'), `${VERSION ?? 'unknown'}\n`);
  }

  log(`Installed helpers ${VERSION ?? ''} in ${path.join(CONF, 'bin')} (node ${process.versions.node})`);
}

async function cmdAddSite(args) {
  const alias = requireAlias(args._[0]);
  const url = new URL(requireArg(args, 'url'));

  if (url.protocol !== 'https:') {
    throw new Error('The site URL must use https.');
  }

  const config = { alias, baseUrl: url.origin + url.pathname.replace(/\/+$/, '') };

  ensureInstalled();
  const file = path.join(CONF, 'sites', `${alias}.json`);
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  log(`Wrote ${file}`);
  writeHeadersHelper(alias);

  if (!fs.existsSync(path.join(CONF, 'tokens', alias))) {
    log(`Next: store the API token with "joomla-toolkit set-token ${alias}"`);
  }
}

async function cmdSetToken(args) {
  const alias = requireAlias(args._[0]);
  ensureInstalled();

  let token;

  if (args.from) {
    token = fs.readFileSync(expandHome(args.from), 'utf8');
  } else if (!process.stdin.isTTY) {
    token = fs.readFileSync(0, 'utf8');
  } else {
    process.stdout.write(`Paste the Joomla API token for ${alias} and press Enter: `);
    spawnSync('stty', ['-echo'], { stdio: 'inherit' });

    try {
      token = await readLine();
    } finally {
      spawnSync('stty', ['echo'], { stdio: 'inherit' });
      process.stdout.write('\n');
    }
  }

  token = token.replace(/\s+/g, '');

  if (token.length < 20) {
    throw new Error('That does not look like a Joomla API token.');
  }

  const file = path.join(CONF, 'tokens', alias);
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  log(`Stored token for ${alias} in ${file}`);
}

async function cmdLinkProject(args) {
  const alias = requireAlias(args._[0]);

  if (args.dir === true) {
    throw new Error('Missing value for --dir.');
  }

  const dir = path.resolve(expandHome(args.dir ?? process.cwd()));
  const site = readSite(alias);
  const endpoint = `${site.baseUrl}/${MCP_ROUTE}`;

  // .mcp.json: add or replace the "joomla" server, keep everything else. Another entry for the same
  // endpoint (from a manual setup) would only duplicate the tools, so it is removed
  const mcpFile = path.join(dir, '.mcp.json');
  const mcp = readJson(mcpFile) ?? {};
  const duplicates = Object.keys(mcp.mcpServers ?? {})
    .filter((key) => key !== 'joomla' && mcp.mcpServers[key]?.url === endpoint);
  mcp.mcpServers = {
    ...Object.fromEntries(Object.entries(mcp.mcpServers ?? {}).filter(([key]) => !duplicates.includes(key))),
    joomla: { type: 'http', url: endpoint, headersHelper: writeHeadersHelper(alias) },
  };
  writeJson(mcpFile, mcp);

  if (duplicates.length) {
    log(`Removed duplicate server(s) for the same endpoint: ${duplicates.join(', ')}`);
  }

  log(`Updated ${mcpFile}`);

  // .claude/joomla-site.json: lets the helpers find the site from the project folder
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  writeJson(path.join(claudeDir, 'joomla-site.json'), { alias, url: site.baseUrl });
  log(`Wrote ${path.join(claudeDir, 'joomla-site.json')}`);

  // .claude/settings.local.json: enable the server and allow the read and plan tools
  const settingsFile = path.join(claudeDir, 'settings.local.json');
  const settings = readJson(settingsFile) ?? {};
  settings.permissions = settings.permissions ?? {};
  settings.permissions.allow = unique([...(settings.permissions.allow ?? []), ...ALLOWED_TOOLS]);
  settings.permissions.allow = settings.permissions.allow
    .filter((rule) => !duplicates.some((key) => rule.startsWith(`mcp__${key}__`)));
  settings.enabledMcpjsonServers = unique([...(settings.enabledMcpjsonServers ?? []), 'joomla'])
    .filter((key) => !duplicates.includes(key));

  if (settings.disabledMcpjsonServers) {
    settings.disabledMcpjsonServers = settings.disabledMcpjsonServers.filter((key) => key !== 'joomla');
  }

  writeJson(settingsFile, settings);
  log(`Updated ${settingsFile}`);

  // AGENTS.md: add or refresh the toolkit section between its markers
  const agentsFile = path.join(dir, 'AGENTS.md');
  const section = fs.readFileSync(path.join(TEMPLATES_DIR, 'agents-section.md'), 'utf8')
    .replaceAll('{{ALIAS}}', alias)
    .replaceAll('{{URL}}', site.baseUrl)
    .replaceAll('{{CONF}}', CONF.startsWith(os.homedir()) ? `~${CONF.slice(os.homedir().length)}` : CONF)
    .trim();
  const block = `${MARKER_START}\n${section}\n${MARKER_END}`;
  const agents = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : '# AGENTS.md\n';
  const pattern = new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}`);
  const updated = pattern.test(agents) ? agents.replace(pattern, block) : `${agents.trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(agentsFile, updated);
  log(`Updated ${agentsFile}`);

  const claudeFile = path.join(dir, 'CLAUDE.md');

  if (!fs.existsSync(claudeFile) || !fs.readFileSync(claudeFile, 'utf8').includes('@AGENTS.md')) {
    log('Note: CLAUDE.md does not import AGENTS.md. Add a line "@AGENTS.md" so Claude Code reads it.');
  }

  if (fs.existsSync(path.join(dir, '.git'))) {
    ensureGitignore(dir, ['.claude/settings.local.json']);
  }

  log('Restart Claude Code in this project to connect the "joomla" MCP server.');
}

function cmdListSites() {
  const dir = path.join(CONF, 'sites');

  if (!fs.existsSync(dir)) {
    log('No sites configured yet.');
    return;
  }

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const alias = file.slice(0, -5);
    const site = readSite(alias);
    const token = fs.existsSync(path.join(CONF, 'tokens', alias)) ? 'token set' : 'NO TOKEN';
    console.log(`${alias.padEnd(24)} ${site.baseUrl.padEnd(48)} ${token}`);
  }
}

function cmdStatus(args) {
  const legacyServer = readText('server-path');

  console.log(`Config folder : ${CONF}${fs.existsSync(CONF) ? '' : ' (missing, run install)'}`);
  console.log(`Node          : ${process.versions.node}`);

  if (legacyServer) {
    console.log(`Legacy        : TypeScript server in ${legacyServer}, only used by projects that are not relinked yet`);
  }

  const helperDrift = BIN_FILES.filter((file) => {
    const installed = path.join(CONF, 'bin', file);
    return !fs.existsSync(installed)
      || fs.readFileSync(installed, 'utf8') !== fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
  });
  const installedVersion = readText(path.join('bin', 'VERSION'));
  console.log(`Helpers       : ${helperDrift.length ? `outdated or missing (${helperDrift.join(', ')}), run install` : `up to date${installedVersion ? ` (${installedVersion})` : ''}`}`);

  if (args._[0]) {
    const alias = requireAlias(args._[0]);
    const site = readSite(alias);
    console.log(`Site ${alias}  : ${site.baseUrl}`);
    console.log(`MCP endpoint  : ${site.baseUrl}/${MCP_ROUTE}`);
    console.log(`Token         : ${fs.existsSync(path.join(CONF, 'tokens', alias)) ? 'present' : 'missing'}`);
    console.log(`Header helper : ${fs.existsSync(path.join(CONF, 'headers', alias)) ? 'present' : 'missing, run add-site or link-project'}`);
  }
}

function ensureInstalled() {
  if (!fs.existsSync(path.join(CONF, 'bin', 'joomla-toolkit.mjs'))) {
    throw new Error('The toolkit is not installed on this machine yet. Run "joomla-toolkit install" first.');
  }
}

function readSite(alias) {
  const config = readJson(path.join(CONF, 'sites', `${alias}.json`));
  // Configs written before 0.3.0 use the format of the TypeScript joomengine server
  const baseUrl = config?.baseUrl ?? config?.sites?.[alias]?.api?.baseUrl;

  if (!baseUrl) {
    throw new Error(`Site "${alias}" is not configured. Run "joomla-toolkit add-site ${alias} --url <url>".`);
  }

  return { baseUrl };
}

// Claude Code runs this script to get the request headers, so the token stays out of .mcp.json
function writeHeadersHelper(alias) {
  const dir = path.join(CONF, 'headers');
  const file = path.join(dir, alias);

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `#!/bin/sh
# Prints the Joomla API token header for the JoomEngine MCP endpoint of "${alias}" (Claude Code headersHelper).
TOKEN=$(tr -d '[:space:]' < "\${JOOMLA_TOOLKIT_CONFIG:-$HOME/.config/joomla-mcp}/tokens/${alias}") || exit 66
printf '{"X-Joomla-Token":"%s"}\\n' "$TOKEN"
`, { mode: 0o700 });
  fs.chmodSync(file, 0o700);

  return file;
}

function ensureGitignore(dir, entries) {
  const file = path.join(dir, '.gitignore');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const missing = entries.filter((entry) => !current.split('\n').includes(entry));

  if (missing.length) {
    fs.writeFileSync(file, `${current.trimEnd()}${current ? '\n' : ''}${missing.join('\n')}\n`);
    log(`Added ${missing.join(', ')} to ${file}`);
  }
}

function parseArgs(list) {
  const args = { _: [] };

  for (let i = 0; i < list.length; i++) {
    const item = list[i];

    if (item.startsWith('--')) {
      const [key, value] = item.slice(2).split(/=(.*)/s);
      args[key] = value ?? (list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true);
    } else {
      args._.push(item);
    }
  }

  return args;
}

function requireAlias(alias) {
  if (!alias || !ALIAS_PATTERN.test(alias)) {
    throw new Error('Give a site alias: a letter followed by letters, digits, "-" or "_" (max 64).');
  }

  return alias;
}

function requireArg(args, key) {
  if (!args[key] || args[key] === true) {
    throw new Error(`Missing --${key}.`);
  }

  return String(args[key]);
}

function readText(name) {
  const file = path.join(CONF, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : null;
}

function readVersion() {
  const manifest = path.join(SCRIPTS_DIR, '..', '.claude-plugin', 'plugin.json');
  const stamp = path.join(SCRIPTS_DIR, 'VERSION');

  try {
    if (fs.existsSync(manifest)) {
      return JSON.parse(fs.readFileSync(manifest, 'utf8')).version ?? null;
    }

    return fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : null;
  } catch {
    return null;
  }
}

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function unique(list) {
  return [...new Set(list)];
}

function expandHome(value) {
  return String(value).replace(/^~(?=$|\/)/, os.homedir());
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readLine() {
  return new Promise((resolve) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function onData(chunk) {
      buffer += chunk;

      if (buffer.includes('\n')) {
        process.stdin.off('data', onData);
        process.stdin.pause();
        resolve(buffer.split('\n')[0]);
      }
    });
  });
}

function log(message) {
  console.log(message);
}

function fail(message) {
  console.error(`joomla-toolkit: ${message}`);
  process.exit(1);
}
