# Changelog

## 0.5.0 (2026-11-05)

First public release.

- Manual and tour starters are in English; `init.mjs --lang` (en, nl, de, fr) sets the browser locale, the default file name and the label of the table of contents.
- `login.mjs` also reads `manual/.auth/login.env`, so credentials never have to pass through the conversation; the test account recipe in the tours skill writes that file.
- `login.mjs` and `logo.mjs` honour `browserChannel` from `manual.config.json`; the Super User warning no longer depends on the administrator language.
- `tours.mjs validate` checks `tours.json` without site access; `validate`, `check`, `install` and `remove` accept a folder as well as a file.
- `install.php` refuses sites that are not on MySQL or MariaDB and accepts `host:port` and `host:/socket` database hosts.
- `joomla-toolkit install` stamps the installed helpers with the plugin version, shown by `status`; `joomla-check` rejects a stored value that is not a Joomla API token.
- Skills reference `${CLAUDE_PLUGIN_ROOT}`; examples are generic; LICENSE, plugin icon and this changelog added.

## 0.4.0 (2026-11-04)

- Tours skill: guided tours written in the client's language, installed over SSH and tested step by step with a test account; core tours can be hidden from the client with an access level.
- Manual skill: findings from Joomla 6.2 (media picker, image class fields); notes on the 6.2 date handling.

## 0.3.x (2026-10)

- 0.3.0: the toolkit uses the JoomEngine MCP PHP package on the site instead of a local server.
- 0.3.1 and 0.3.2: setup offers an SSH public key for the hosting panel and logs in as `account@host`.
- 0.3.3: content skill sends article text as `introtext` and `fulltext`; image writes are split off because they always verify as uncertain.
- Step-by-step checklist for connecting a new site (`docs/NEW-SITE.md`).

## 0.2 (2026-09-29)

- Manual skill: illustrated client manuals with annotated administrator screenshots.
- Content skill: menu component ids, child template styles, field defaults, custom field values through the MCP server.

## 0.1 (2026-09-28)

- Setup, content workflow and the custom field helper; time zone advice for the API user.
