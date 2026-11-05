# Claude Joomla Toolkit

A Claude Code plugin that connects a project to its live Joomla website through the [JoomEngine MCP server](https://github.com/joomengine/mcp_package), a Joomla package that runs on the site itself. It gives you a guided setup, the write workflow with the quirks found on live sites, a health check, and two skills that produce things for the people who maintain the site: an illustrated manual and guided tours inside the administrator.

## What you get

| | |
|---|---|
| `/joomla-toolkit:setup` | Walks through the Joomla side (package, plugins, API user), stores the API token outside the project, links the project (`.mcp.json`, permissions, `AGENTS.md`) and runs a health check. |
| `joomla-toolkit:content` | Loaded automatically for Joomla work: the read and write workflow of the MCP server and the quirks found on live sites (menu item aliases and component ids, child template styles, trash before delete, custom fields, dates). |
| `/joomla-toolkit:doctor` | Checks the helpers, the token, the package version on the site and the project files, and repairs them. |
| `/joomla-toolkit:manual` | Writes an illustrated manual (Word and PDF) for the client: discusses the contents first, then captures annotated screenshots with a test account that has the client's rights, without saving anything on the live site. |
| `/joomla-toolkit:tours` | Builds guided tours ("Take a tour") for the client in their own language, installs them in the site database over SSH and walks through every step with a test account. Pairs with the manual: tour 3 and chapter 3 cover the same task. |
| `joomla-fields.mjs` | `list`, `get` and `set` custom field values of articles. The MCP server sets field values itself; the helper remains for reading the values that apply to one article. |
| `joomla-check.mjs` | Read-only check of the token, the API user and the MCP server. |

## Install

```text
/plugin marketplace add TLWebdesign/Claude-Joomla-Toolkit
/plugin install joomla-toolkit@tlwebdesign
```

Then, in the project of a Joomla website:

```text
/joomla-toolkit:setup mysite https://www.example.com
```

## Requirements

- macOS or Linux with Node 20 or later. Windows is not supported (the token helper is a shell script and the manual uses a POSIX Python environment).
- A Joomla 6.1+ website (PHP 8.3+) with Web Services enabled and the [JoomEngine MCP package](https://github.com/joomengine/mcp_package/tags) 1.0.4 or later installed. [Connecting a new Joomla site](docs/NEW-SITE.md) has the full checklist.
- For the manual: Google Chrome, Python 3, and Microsoft Word (macOS) or LibreOffice for the PDF. Playwright, docx and PyMuPDF are installed in the manual's own work folder.
- For the tours: SSH access to the hosting account and a MySQL or MariaDB database.

## Language

The skills write manuals and tours in the language of the site and its editors. The starter files are English; `init.mjs --lang nl` (or `de`, `fr`) switches the defaults of the manual. The reference notes in the manual and tours skills were gathered on sites with a Dutch administrator, so they list the English labels next to the Dutch ones that were tested; ids and `href` fragments are the same in every language.

## How it is laid out

Everything machine-wide lives in `~/.config/joomla-mcp`:

```text
~/.config/joomla-mcp/
  bin/                   helpers, copied from the plugin by "install"
  templates/             the AGENTS.md section template, copied by "install"
  sites/<alias>.json     alias and base URL of one site
  tokens/<alias>         API token of that site (0600)
  headers/<alias>        script that prints the token header for Claude Code (0700)
```

Each project only gets:

- `.mcp.json` with an HTTP server `joomla`: the site's endpoint `/api/index.php/v1/joomengine-mcp`, with `~/.config/joomla-mcp/headers/<alias>` as `headersHelper`
- `.claude/joomla-site.json` with the alias and URL
- `.claude/settings.local.json` entries that allow the read and plan tools (permission grants and writes keep asking); the file is added to `.gitignore`
- a section in `AGENTS.md` between `<!-- joomla-toolkit:start -->` and `<!-- joomla-toolkit:end -->`

Because every project connects to the endpoint of its own site, a Claude session in one project can never reach another site. The server acts as the API user, so Joomla's permissions apply, and every write needs a grant that you confirm with an acknowledgement phrase; grants are stored on the site. Tokens never live in the project folder, so they cannot end up in a project's git repository, and the skills never ask for a token or a password in the conversation.

## Manuals

`/joomla-toolkit:manual` first proposes an outline based on the site (categories, custom field groups, template overrides) and waits until you agree. It then asks for a test account in the client's user group, and has you log in in your own terminal so the password stays out of the conversation. The work folder (default `manual/` in the project) holds the capture scripts, the screenshots, `content.cjs` with the text and the output:

```text
manual/
  manual.config.json     site URL, language, viewport, colours, file name
  capture-*.mjs          one screenshot script per chapter (never saves, always closes forms)
  content.cjs            the text of the manual
  shots/                 screenshots and the logo
  out/                   .docx, .pdf and preview contact sheets
  .auth/                 browser session and optional login.env (git-ignored)
```

`node make.mjs` builds the .docx, exports the PDF, fills the table of contents with page numbers and renders contact sheets for review. Rerun the capture scripts after a Joomla update to refresh the screenshots.

## Guided tours

`/joomla-toolkit:tours` writes Joomla guided tours for the client. Joomla has no Web Services route for tours, so they live in a `tours/` folder in the project and are written straight into the database over SSH:

```text
tours/
  tours.json     prefix, SSH login, Joomla root and the tours with their steps
  tours.mjs      validate | check (dry run on the site, rolled back) | install | remove
  install.php    copied to the server for each run and removed again
```

Only tours whose uid starts with the prefix are touched. `node test-tours.mjs` in the manual folder starts every tour as the test account, clicks through all steps and reports steps that do not attach to their element, with a screenshot per step in `manual/tourtest/`.

## Joomla side

[Connecting a new Joomla site](docs/NEW-SITE.md) has the full step-by-step checklist. In short, per site:

1. Install the [JoomEngine MCP package](https://github.com/joomengine/mcp_package/tags) (System → Install → Extensions) and set **Canonical Joomla API URL** to `https://your-site/api/index.php` under Components → JoomEngine MCP → Options.
2. Enable the plugins **Web Services - JoomEngine MCP**, **API Authentication - Web Services Joomla Token** and **User - Joomla API Token**, and the Web Services plugins for the parts you want to manage.
3. Create a dedicated API user with only the permissions it needs: Web Services Login, a place in the allowed groups of the token plugin, and `mcp.access`, `mcp.execute`, `mcp.write` and `mcp.approve` on the JoomEngine MCP component.
4. Set that user's time zone to **Atlantic/Reykjavik** (UTC+0 all year). The user settings have no plain UTC option, and London or Dublin use summer time. Before Joomla 6.2.0 any other time zone makes core move unsent dates on every API update; from 6.2.0 only dates that are sent are read in this time zone, which the setting keeps as sent.
5. Log in as that user, copy its API token from the profile and store it with `node ~/.config/joomla-mcp/bin/joomla-toolkit.mjs set-token <alias>`.

## CLI

The setup skill drives this, but it can be used directly:

```bash
node scripts/joomla-toolkit.mjs install
node scripts/joomla-toolkit.mjs add-site <alias> --url https://www.example.com
node scripts/joomla-toolkit.mjs set-token <alias> [--from <file>]
node scripts/joomla-toolkit.mjs link-project <alias> [--dir <project>]
node scripts/joomla-toolkit.mjs list-sites
node scripts/joomla-toolkit.mjs status [<alias>]
```

What the server may do is decided on the site: by the Joomla permissions of the API user and by the write grants you confirm. Keep that user's group as small as the work needs.

## Contributing

Issues and pull requests are welcome at <https://github.com/TLWebdesign/Claude-Joomla-Toolkit>. The quirks in the content skill and the selectors in the reference notes come from live sites; when you find that something behaves differently on your Joomla version, say which version and what you saw.

## License

GPL-2.0-or-later, see [LICENSE](LICENSE).
