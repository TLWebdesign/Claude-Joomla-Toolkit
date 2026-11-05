## Joomla site management (Joomla Toolkit)

Content and configuration of the live site `{{URL}}` are managed through the **JoomEngine MCP server**, a Joomla component on the site itself, registered in `.mcp.json` as the HTTP server `joomla` (toolkit alias `{{ALIAS}}`). Its tools appear as `mcp__joomla__*`; leave out their `site` argument. Custom field values are set through the MCP server as well, by field name in the create or update `data`.

Before changing anything, load the `joomla-toolkit:content` skill for the full workflow and the known quirks.

**Reading:** `joomla_actions_search` (with `includeWrites: true` to also see write actions), `joomla_action_describe` for the input schema, then `joomla_action_read`. Shortcuts: `joomla_content_articles_list`, `joomla_content_article_get`.

**Writing:** `joomla_permission_request` (toolsets `content.write` for articles, `structure.write` for categories, menus, modules, template styles and fields, `media.write` for media), show the acknowledgement phrase to the user and **wait for the user to confirm it**, then `joomla_permission_approve`, `joomla_action_write_plan` (fresh UUID `idempotencyKey`, `dryRun: true` first if unsure) and `joomla_write_apply`. If a write ends as `uncertain`, further writes are blocked until the user reconciles it in the administrator (Components → JoomEngine MCP → Operations).

**Custom field values** that apply to one article can be read (or set) with the helper:

```bash
node {{CONF}}/bin/joomla-fields.mjs list
node {{CONF}}/bin/joomla-fields.mjs get <articleId>
node {{CONF}}/bin/joomla-fields.mjs set <articleId> --json '{"field-name": "value"}'
```

**Health check:** `node {{CONF}}/bin/joomla-check.mjs`
