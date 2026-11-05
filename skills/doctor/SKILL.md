---
description: Check and repair the Joomla Toolkit setup of the current project and machine (helpers, site config, token, JoomEngine MCP version on the site, MCP connection).
disable-model-invocation: true
---

# Joomla Toolkit doctor

The toolkit CLI is `node "${CLAUDE_PLUGIN_ROOT}/scripts/joomla-toolkit.mjs"` (called `toolkit` below). Run the checks, then report findings in a short list with a suggested fix for each problem. Only change things after the user agrees.

1. `toolkit status`, plus `toolkit status <alias>` with the alias from `.claude/joomla-site.json` when the project is linked. If the project is not linked, say so and suggest `/joomla-toolkit:setup`. If the helpers are outdated, suggest `toolkit install`.
2. `node ~/.config/joomla-mcp/bin/joomla-check.mjs` for the token, the API user and the MCP server on the site. It reports the version of the JoomEngine MCP package and says when it is too old. Compare it with the newest tag on `https://github.com/joomengine/mcp_package/tags`; the user updates the package in the Joomla administrator (System → Install → Extensions).
3. Check the project files: `.mcp.json` has a `joomla` server of type `http` whose `url` ends in `/api/index.php/v1/joomengine-mcp` and whose `headersHelper` is `~/.config/joomla-mcp/headers/<alias>`, `AGENTS.md` contains the `joomla-toolkit:start` section, and `CLAUDE.md` imports `@AGENTS.md`. `toolkit link-project <alias>` repairs all of these.
4. If the project is a git repository, check that `.claude/settings.local.json` is ignored and that no token file is tracked (`git ls-files | grep -iE 'token|settings.local'`).
5. If writes fail with `WRITE_BUSY`, an earlier write is waiting for reconciliation: the user handles it in the Joomla administrator under Components → JoomEngine MCP → Operations.
6. Remind the user to check that the API user's time zone is UTC+0 all year (Atlantic/Reykjavik, not London or Dublin) if they see article dates move after updates (every update before Joomla 6.2.0; from 6.2.0 only dates that are sent).
