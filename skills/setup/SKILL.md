---
description: Connect the current project to the JoomEngine MCP server on its Joomla website, including the Joomla-side checklist, the API token, project files and a health check.
disable-model-invocation: true
argument-hint: "[site-alias] [https://site-url]"
---

# Joomla Toolkit setup

Connect the current project folder to a live Joomla website through the JoomEngine MCP server. The server is a Joomla package (`pkg_joomengine_mcp`) that runs on the site itself; Claude Code connects to it over HTTPS with the API user's token, so nothing but the helpers is installed on this machine. Work through the steps in order and stop to ask the user whenever a step needs their input. Keep the user informed in short lines.

The toolkit CLI is `node "${CLAUDE_PLUGIN_ROOT}/scripts/joomla-toolkit.mjs"` (called `toolkit` below). Arguments given by the user: `$ARGUMENTS`.

## 1. Machine setup

1. Check the prerequisite: `node --version` (20 or later). If Node is too old, stop and tell the user.
2. Run `toolkit status`. If the helpers are outdated or missing, run `toolkit install` (it copies the helpers to `~/.config/joomla-mcp/bin`).

## 2. The site

1. Determine the site URL (https) and an alias. Take them from the arguments when given; otherwise ask. Suggest an alias based on the domain, for example `examplesite` for `https://www.example-site.com`. Run `toolkit list-sites` first: if the alias already exists for another URL, ask the user for a different alias.
2. Check what answers, with `curl -s -o /dev/null -w '%{http_code}' <address>`:
   - `<url>/api/index.php/v1/content/articles` should return `401` (API present, token needed). `404` means Web Services are not reachable at that URL.
   - `<url>/api/index.php/v1/joomengine-mcp` should return `401` too. `404` means the JoomEngine MCP package is not installed or its Web Services plugin is disabled. `403` usually comes from a firewall (for example Admin Tools); the user has to allow their IP address.
3. Give the user this checklist for the Joomla side and wait until they confirm it is done. Skip what the checks above already prove:
   - Joomla **6.1 or later** and PHP **8.3 or later**.
   - The **JoomEngine MCP package** installed: download the ZIP of the newest tag (1.0.4 or later) from `https://github.com/joomengine/mcp_package/tags` and upload it under System → Install → Extensions.
   - Plugins enabled: **Web Services - JoomEngine MCP**, **API Authentication - Web Services Joomla Token** and **User - Joomla API Token**, plus the core Web Services plugins for the parts to manage (content, menus, modules, templates, fields, media).
   - **Components → JoomEngine MCP → Options**: set **Canonical Joomla API URL** to `<url>/api/index.php` and save. **PHP CLI executable** stays empty (it is only for JCB background jobs). **Site alias** may stay `default`.
   - A **dedicated API user** (not the user's own admin account) in a group with only the permissions needed. That group needs: Web Services Login (`core.login.api`, Global Configuration → Permissions), a place in **Allowed User Groups** of the plugin User - Joomla API Token, and in JoomEngine MCP → Options → Permissions the rights **Access the MCP endpoint**, **Discover and execute definitions**, **Request confirmed mutations** and **Approve requested MCP write grants** (`mcp.access`, `mcp.execute`, `mcp.write`, `mcp.approve`). The normal Joomla permissions for articles, menus and so on still decide what the user can change.
   - That user's **Basic Settings > Time Zone set to a zone that is UTC+0 all year: "Atlantic/Reykjavik"** (or "Africa/Abidjan"). The user settings have no plain UTC option, and "Use Default", "Europe/London" or "Europe/Dublin" do not work (the default is the site time zone; London and Dublin use summer time). Before Joomla 6.2.0, core moves unsent dates by the time zone offset on every API update otherwise. From 6.2.0 unsent dates stay put, but dates that are sent are still read in this user's time zone, so the setting keeps them as sent.
   - An API token for that user. Joomla only shows a token to its own user: log in as the API user, open the profile, and copy the token from the Joomla API Token tab (save the profile once if the tab is still empty).
4. Run `toolkit add-site <alias> --url <url>`.
5. Store the token **without it passing through the conversation**. Ask the user to run one of these, then wait:
   - In their own terminal (hidden input): `node ~/.config/joomla-mcp/bin/joomla-toolkit.mjs set-token <alias>`
   - Or after copying the token to the clipboard, in Claude Code: `! pbpaste | node ~/.config/joomla-mcp/bin/joomla-toolkit.mjs set-token <alias>` (on Linux use `xclip -selection clipboard -o` or `wl-paste` instead of `pbpaste`)
   If the user already keeps the token in a file outside the project, offer `toolkit set-token <alias> --from <file>` instead.
   Never ask the user to paste the token into the chat. Never print the token.
6. Optional: SSH access to the site's hosting account (needed for guided tours, handy for the manual). Give the user the command for an SSH public key on this machine, so they can paste it into the hosting panel (for example DirectAdmin → SSH Keys or cPanel → SSH Access). Prefer a key the user already uses for that server: list the hosts in `~/.ssh/config` with their `HostName` and `IdentityFile` (`awk '/^Host /{h=$2} /HostName|IdentityFile/{print h, $1, $2}' ~/.ssh/config`) and ask which server hosts the site (for example `myhost`). Then give:
   `! pbcopy < <IdentityFile>.pub; cat <IdentityFile>.pub`
   If there is no matching key, use the default key, created first if it is missing:
   `! [ -f ~/.ssh/id_ed25519.pub ] || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -C "$(whoami)@$(hostname -s)"; pbcopy < ~/.ssh/id_ed25519.pub; cat ~/.ssh/id_ed25519.pub`
   (On Linux replace `pbcopy` with `xclip -selection clipboard` or `wl-copy`.) Once the key is added, the user logs in with `ssh <account>@<existing host>` (for example `ssh example@myhost`): the existing `~/.ssh/config` entry supplies the server and key, and `<account>@` replaces its user. Do not suggest a new config entry. Offer to test it with `ssh -o BatchMode=yes <account>@<existing host> whoami`. Only ever show `.pub` files, never a private key. Do not wait for this step.

## 3. The project

1. Run `toolkit link-project <alias> --dir "$CLAUDE_PROJECT_DIR"` (use the current project root). It merges `.mcp.json` (an HTTP server `joomla` that points to the site's endpoint, with a `headersHelper` that reads the token file), writes `.claude/joomla-site.json`, merges `.claude/settings.local.json` (enables the server, allows only the read and plan tools, so grants and applies still ask) and adds or refreshes the toolkit section in `AGENTS.md`.
2. If it reports that `CLAUDE.md` does not import `AGENTS.md`, ask the user whether to add a line `@AGENTS.md` to `CLAUDE.md` (create the file if it does not exist).
3. If the project is a git repository, check that no token file is tracked (`git ls-files | grep -i token`).

## 4. Verify

1. Run `node ~/.config/joomla-mcp/bin/joomla-check.mjs --site <alias>` and report the result. Fix and rerun on failures (common causes: token not stored, plugin disabled, missing permission, wrong URL, canonical API URL not saved, firewall).
2. Tell the user to restart Claude Code in the project and approve the `joomla` server; `/mcp` shows whether it is connected.
3. Offer an end-to-end write test once the server is connected: create an unpublished dummy article titled `[MCP TEST] ...` through the MCP write flow (the user confirms the acknowledgement phrase), read it back, trash it (`state: -2`), delete it, and confirm it is gone. Ask for a `30-minutes` grant so one confirmation covers the test. Use the `joomla-toolkit:content` skill for the workflow.

Finish with a short summary: site alias and URL, what was written to the project, check results, and anything still open (for example the time zone of the API user).
