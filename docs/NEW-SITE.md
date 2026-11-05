# Connecting a new Joomla site

A checklist for linking a new Joomla website to Claude Code with the Joomla Toolkit. It takes about ten minutes. In the examples the site is `https://www.example.com` and its alias is `example`.

The alias is a short name you pick for the site on your own machine: a letter followed by letters, digits, `-` or `_`. It names the token file and the site config in `~/.config/joomla-mcp`.

## Before you start

- The site runs **Joomla 6.1 or later** on **PHP 8.3 or later**, over HTTPS.
- Your machine runs macOS or Linux with Node 20 or later.
- The site's files are in a local project folder (this is where Claude Code will run).
- The toolkit plugin is installed in Claude Code. If not:

  ```text
  /plugin marketplace add TLWebdesign/Claude-Joomla-Toolkit
  /plugin install joomla-toolkit@tlwebdesign
  ```

## Part 1: in the Joomla administrator

### 1. Install the JoomEngine MCP package

1. Download the ZIP of the newest tag from <https://github.com/joomengine/mcp_package/tags> (1.0.4 or later).
2. Upload it under **System → Install → Extensions**.

### 2. Check the plugins

Under **System → Manage → Plugins**, these must be enabled:

- **Web Services - JoomEngine MCP**
- **API Authentication - Web Services Joomla Token**
- **User - Joomla API Token**
- The core **Web Services** plugins for what you want to manage: Content, Menus, Modules, Templates, Fields, Media.

### 3. Configure the component

Open **Components → JoomEngine MCP → Options**, tab **Endpoint and limits**:

| Setting | Value |
|---|---|
| Canonical Joomla API URL | `https://www.example.com/api/index.php` |
| Site alias | Leave it on `default`, or enter your alias |
| PHP CLI executable | Leave empty (only needed for JCB background jobs) |
| Private artifact directory | Leave empty, or a writable folder outside the web root |

Save.

### 4. Create the API user

Use a dedicated user, not your own administrator account.

1. **Users → Groups:** create a group for the API user, or pick an existing one. Give it only the Joomla permissions the work needs (for example create, edit and delete on articles, menus and modules).
2. **Users → Manage:** create the user in that group.
3. In the user's **Basic Settings**, set **Time Zone** to `Atlantic/Reykjavik`. Before Joomla 6.2.0, other time zones make Joomla shift article dates on every API update. Joomla 6.2.0 fixed that for dates that are not sent, but dates that are sent are still read in this user's time zone, so keep the setting on every version.

### 5. Give the group its permissions

| Where | Permission |
|---|---|
| **System → Global Configuration → Permissions** | **Web Services Login**: Allowed |
| Plugin **User - Joomla API Token** → **Allowed User Groups** | Add the group |
| **Components → JoomEngine MCP → Options → Permissions** | **Access the MCP endpoint**, **Discover and execute definitions**, **Request confirmed mutations** and **Approve requested MCP write grants**: Allowed |

### 6. Get the token

Joomla only shows a token to the user it belongs to.

1. Log in to the administrator **as the API user**. If the group has no administrator login, log in on the site's front end and open the profile there, or allow administrator login for a moment.
2. Open the user's own profile, tab **Joomla API Token**. If the tab is empty, save the profile once and reopen it.
3. Set **Active** to **Yes**, save, and copy the token.

### 7. Firewall

If the site runs Admin Tools or another firewall, allow your own IP address. Otherwise the API calls get you banned.

## Part 2: on your machine

### Option A: let Claude do it

Start Claude Code in the project folder and run:

```text
/joomla-toolkit:setup example https://www.example.com
```

It checks the site, asks you to store the token (step 2 below) and links the project.

### Option B: by hand

1. Add the site:

   ```bash
   node ~/.config/joomla-mcp/bin/joomla-toolkit.mjs add-site example --url https://www.example.com
   ```

2. Store the token. Never paste it into a chat. With the token on the clipboard (macOS; on Linux use `xclip -selection clipboard -o` or `wl-paste`):

   ```bash
   pbpaste | node ~/.config/joomla-mcp/bin/joomla-toolkit.mjs set-token example
   ```

   Or run `set-token example` without the pipe and paste the token at the hidden prompt.

3. Link the project folder:

   ```bash
   node ~/.config/joomla-mcp/bin/joomla-toolkit.mjs link-project example --dir /path/to/project
   ```

4. Make sure `CLAUDE.md` in the project contains the line `@AGENTS.md`.

5. Optional, for SSH access to the site's hosting account (the guided tours need it): copy a public key and paste it into the hosting panel (for example DirectAdmin → SSH Keys or cPanel → SSH Access). If `~/.ssh/config` already has an entry for that server, use its key, for example `pbcopy < ~/.ssh/id_ed25519_myhost.pub`. Then log in with `ssh <account>@<that host>`, for example `ssh example@myhost`: the existing entry supplies the server and key, `example@` replaces its user. Otherwise use the default key; this command creates `~/.ssh/id_ed25519` first if it does not exist:

   ```bash
   [ -f ~/.ssh/id_ed25519.pub ] || ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -C "$(whoami)@$(hostname -s)"; pbcopy < ~/.ssh/id_ed25519.pub; cat ~/.ssh/id_ed25519.pub
   ```

   On Linux replace `pbcopy` with `xclip -selection clipboard` or `wl-copy`.

If `~/.config/joomla-mcp/bin` does not exist yet, run `node scripts/joomla-toolkit.mjs install` from this repository first.

## Part 3: check

1. In the project folder:

   ```bash
   node ~/.config/joomla-mcp/bin/joomla-check.mjs
   ```

   All three lines (API and token, API user, MCP server) should say `ok`.

2. Start Claude Code in the project folder and approve the `joomla` server. `/mcp` shows whether it is connected.
3. Ask Claude to run the write test: it creates a dummy article, reads it back, trashes and deletes it. You confirm one permission phrase.

## When something fails

| What you see | What to check |
|---|---|
| HTTP 404 on the MCP endpoint | Package installed, plugin **Web Services - JoomEngine MCP** enabled |
| HTTP 401 | Token stored, both token plugins enabled, group in **Allowed User Groups**, **Web Services Login** allowed, token set to **Active** |
| HTTP 403 | Firewall (allow your IP), or the group misses **Access the MCP endpoint** |
| HTTP 503 or "endpoint not configured" | Canonical Joomla API URL not saved |
| The `joomla` server is missing in `/mcp` | Restart Claude Code; `.mcp.json` is only read at startup |
| Writes fail with `WRITE_BUSY` | An earlier write is waiting: reconcile it under **Components → JoomEngine MCP → Operations** |
| Article dates shift after an update | Time zone of the API user (step 4) |

`/joomla-toolkit:doctor` runs these checks and proposes fixes.

## When the site moves to another domain

1. Change **Canonical Joomla API URL** in the component's Options.
2. Run `add-site` again with the new URL, then `link-project`.
3. Restart Claude Code in the project.
