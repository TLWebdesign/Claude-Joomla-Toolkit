---
description: Write an illustrated manual (Word and PDF) for the people who maintain a Joomla website, with annotated screenshots of the administrator and the live site. Use when the user asks for a manual, handleiding, guide or instructions for a client or editor of the site linked to this project.
argument-hint: "[audience or notes]"
---

# Joomla manual

Produce a manual for the client of the Joomla site linked to this project (`.claude/joomla-site.json`): what they will do, step by step, with screenshots taken as an account that has exactly the client's rights. The result is a `.docx` the user can still edit and a `.pdf` to send.

The helpers live in `${CLAUDE_PLUGIN_ROOT}/scripts/manual`. `init.mjs` copies them into a work folder; everything else runs from that folder (`cd` into it). Notes from the user: `$ARGUMENTS`.

Load `joomla-toolkit:content` as well when you need to read the site through the MCP server. Read `reference.md` in this skill folder before writing capture scripts: it lists the admin selectors and the traps found on Joomla 6. Joomla's labels follow the administrator language of the test account; the reference gives the English labels and the Dutch ones seen on the sites where this was tested.

## 1. Discuss the contents first

Do not take screenshots or write text before the user has agreed on the outline. Prepare the discussion by reading the site (read-only):

- Categories, and which articles are in them (`joomla_content_articles_list`).
- Custom field groups and which categories each field is assigned to (`fields.content-articles.list`). Structured pages such as a team, a schedule or a home page builder are usually custom fields and need their own chapter.
- Template overrides in the project (`templates/*/html`) to see how those fields end up on the site.
- Menu items and the front end, for the "this is where it appears" screenshots.
- The client's dashboard as the test account sees it: custom administrator modules with shortcut buttons ("New blog post", "All reviews") are where the client starts, so the manual starts there too.
- The editor profile of the client's group (`plg_editors_tinymce` → `configuration.setoptions`: paste as text, custom image classes) and the image sizes already used on the site, so the text gives the site's own rules.

Then propose, in the user's language:

1. **Audience and language.** Who will use the manual and in which language it is written (default: the site language).
2. **Chapters**: one per task the client actually does. A typical outline: logging in and the dashboard; creating a news item; editing, unpublishing and restoring versions; media; one chapter per structured page (home page fields, team, schedule, ...); tips and frequently asked questions. Ask which tasks stay with the site builder (menus, modules, categories, fields) and leave those out.
3. **Always-useful topics** for the tips chapter or where they fit: Save vs Save & Close vs Close; the lock icon (checked out) and how to release it; the alias and emptying it after a title change; hiding columns in the article list; pasting with the editor's "Paste as text" button and cleaning up with "Clear formatting" afterwards; a checklist for "my change is not on the site"; contact details for help.
4. **Look and delivery**: site logo and colours on the cover (read them from the template: logo file and `--cassiopeia-color-primary/secondary`, the template's SCSS, or the inline header styles of the front page for templates such as Helix); the files stay in `manual/` in the project unless the user asks for a copy elsewhere; contact details for the help section (ask, never invent them).
5. **Guided tours**: offer them. With `joomla-toolkit:tours` every chapter gets a tour with the same number and the same steps, and the manual's introduction explains how to start one.

Use AskUserQuestion only for real choices; otherwise present the outline and wait for the user to confirm or change it.

## 2. A test account with the client's rights

Screenshots must show what the client sees, so ask the user for a test account **in the same user group as the client**. The user creates it in the Joomla administrator (Users → Manage → New); with SSH access and the user's agreement it can also be created with Joomla's CLI (see `joomla-toolkit:tours`, step 2). If the client would be a Super User, recommend a restricted group first, for example "Editors": parent Publisher, plus Global Configuration "Admin Login" and "Edit Custom Field Value" allowed, Articles and Media "Access Administration Interface" allowed, Media "Create" allowed. Permission changes are the user's decision: make them only when they ask, and expect the auto mode classifier to require their own confirmation.

After logging in, check what the account sees (the login script prints the admin menu). Joomla's "What's new in Joomla" tour starts by itself after an update and covers every screenshot: click **Hide forever** once for the test account, and mention it in the login chapter because the client will see it too. Also check, per article, which custom field tabs appear. Field groups without category assignments show on every article and confuse the client; point this out and let the user fix the field categories before capturing. Moving a field to another category hides its values on articles outside it, so verify the live pages afterwards.

## 3. Set up the work folder and log in

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/manual/init.mjs" manual --url <site url> --lang <language code> --name "<file name>"
```

`--lang` (en, nl, de, fr) sets the browser locale, the default file name and the label of the table of contents; the text itself is whatever you write in `content.cjs`.

Ask the user to log in **in their own terminal**, so the password never passes through the conversation:

```bash
cd <project>/manual && node login.mjs
```

It asks for the username and password with hidden input. If the user prefers, they put both in `manual/.auth/login.env` (two lines, `JOOMLA_MANUAL_USER=...` and `JOOMLA_MANUAL_PASS=...`, `chmod 600`; the folder is git-ignored) and you run `node login.mjs` yourself, which reads that file. Never ask for the password in the conversation. The session is stored in `.auth/state.json`. When a script reports that the session expired, ask for a new login.

## 4. Capture the screenshots

Write one capture script per chapter (`capture-02-news.mjs`, ...), based on `capture-01-basics.mjs`, and run them. Name the images after the chapter (`b2-new-article`), so the text and the images are easy to match.

Rules for the live site:

- **Never save anything.** Open an edit form, fill it for the picture, and leave it with `closeEdit(page)` (Cancel/Close) inside `finally`. That also checks the item in again.
- Adding rows to repeatable fields, choosing files or typing sample text is fine, as long as the form is closed without saving.
- After each script, `checkedOut()` must be empty. If an item stays locked, release it with `node checkin.mjs <id>` (opens and closes it with the same account). Never release a lock that another person (or the user) holds; report it.
- Take front-end screenshots (`launch({ loggedIn: false })`) to show where things appear on the site.
- Look at every screenshot you produce (Read the PNG). Check that the red numbers sit on the right element and that nothing irrelevant or private dominates the picture. Hide incidental clutter (such as another user's lock icon) with CSS only when it does not change what the client needs to learn.

## 5. Write the text

Fill `content.cjs` with the agreed chapters. Write for someone who is not technical: short sentences, numbered steps, one screenshot per step group, and a legend for every red number directly under the image. Use `tip()` for helpful extras and `warn()` for things that can break the site (renaming or deleting images in use, changing the alias of fixed pages, deleting repeatable rows).

Only describe behaviour you have seen on this site or verified in Joomla; say so when something was not tested.

## 6. Build and review

```bash
node make.mjs
```

This builds the `.docx`, exports a PDF (Microsoft Word on macOS, otherwise LibreOffice), builds again with the page numbers for the table of contents, and renders contact sheets to `out/preview/sheet*.png`. Headings are kept together with their intro text and first image, and images with their legend, so a heading never ends a page.

Read every contact sheet before reporting. Look for headings at the bottom of a page, images that are too small to read, legends that do not match the image, and large empty areas. Check the table of contents too: page numbers are found by searching the heading text from page 3 on, so a heading repeated word for word earlier (for example chapter titles in an overview table on the introduction page) gets the wrong page. Word such tables differently. Tables need a real header row; for a short list such as contact details use bullets. Fix and rebuild. Copy the final `.docx` and `.pdf` to the agreed location; if the user has the `.docx` open in Word, ask them to close it first.

## 7. Report

Tell the user where the files are, how many pages, and what they still have to do: remove or block the test account, move the client's account to the agreed group, fill anything you left open. Mention leftovers you noticed that confuse the client, such as test copies of articles at the top of the list. Keep the capture scripts so the screenshots can be refreshed after a Joomla update.
