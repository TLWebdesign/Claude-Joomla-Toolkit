---
description: Build guided tours (Joomla's "Take a tour" / "Doe een rondleiding") for the client of the Joomla site linked to this project, install them in the site database over SSH and test every step with a test account. Use when the user asks for guided tours, rondleidingen or an in-admin walkthrough, also together with a manual.
argument-hint: "[topics or notes]"
---

# Joomla guided tours

Make tours that show the client, inside the Joomla administrator, where to click for the tasks they really do. Each tour is a short walkthrough on the client's own screens, in the client's language, tested with an account that has the client's rights. When a manual is made too (`joomla-toolkit:manual`), the tours and the chapters follow the same order and numbering, so "tour 3" and "chapter 3" cover the same task.

The helpers live in `${CLAUDE_PLUGIN_ROOT}/scripts/tours` (installer) and `${CLAUDE_PLUGIN_ROOT}/scripts/manual` (browser session, tour test). Notes from the user: `$ARGUMENTS`. Read `reference.md` in this skill folder before writing steps: it lists how the tour script behaves, the targets that work on Joomla 6.2 and the traps. Labels follow the administrator language of the client; the reference gives the English ones, and the manual skill's `reference.md` has the Dutch equivalents seen on the sites where this was tested.

## 1. What the client does, and an outline

Read the site first (read-only, through `joomla-toolkit:content` and over SSH): the client's user group, the categories and which ones the client fills, custom field groups per category, the editor profile the client's group gets (TinyMCE sets, paste-as-text, image classes), the Media folders, and **the client's dashboard**: custom administrator modules with shortcut buttons ("New blog post", "All reviews") are the client's real starting points and belong in the tours. Look at the dashboard as the test account, not as yourself.

Propose one tour per task, numbered, with the start screen and the steps in a sentence each. A proven set for a content site: 1 welcome and finding your way; 2 editing an article; 3 a new blog or news item (from the dashboard shortcut when there is one); 4 images in the text versus the intro and full-text image; 5 the Media manager; 6 editing an image (crop, resize, rotate, with the site's own quality and ratio). Ask for the house rules that should be in the text (image sizes, ratio, quality) instead of guessing; check them against what is on the site and point out conflicts (for example a ratio of 2:3 asked while the images in the text are 3:2).

Wait for the user to agree on the outline.

## 2. Access

- **SSH** to the hosting account: tours are written straight into `#__guidedtours` and `#__guidedtour_steps`, because Joomla has no Web Services route for them. Use the SSH login the setup skill arranged (`account@existing-host`). MySQL and MariaDB sites only.
- **A test account in the client's user group**, the same one the manual uses. The simplest route: the user creates it in the Joomla administrator (Users → Manage → New) and logs in with `node login.mjs` in their own terminal, so no password passes through the conversation. With SSH and the user's agreement you can create it with Joomla's CLI instead. The password is generated on this machine and kept in `manual/.auth/login.env` (0600, git-ignored), which `login.mjs` reads; note that it is visible in the server's process list for the moment the command runs, so prefer the administrator on shared hosting.

  ```bash
  mkdir -p manual/.auth && chmod 700 manual/.auth
  PW="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)Aa1!"
  printf 'JOOMLA_MANUAL_USER=manual-test\nJOOMLA_MANUAL_PASS=%s\n' "$PW" > manual/.auth/login.env && chmod 600 manual/.auth/login.env
  ssh account@host "cd <joomla root> && php cli/joomla.php user:add -n --username=manual-test --name='Manual test' --email=<unused address> --usergroup=<client group> --password='$PW'"
  ```

  Then set up the manual work folder and log in: `node "${CLAUDE_PLUGIN_ROOT}/scripts/manual/init.mjs" manual --url <site url> --lang <language code>` and `cd manual && node login.mjs`.
- After the first login Joomla's own "What's new in Joomla" tour starts by itself and covers the page. Click **Hide forever** for the test account, and tell the user the client will see it once too.

## 3. Write tours.json

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tours/tours.mjs" init tours --prefix <site>- --ssh account@host --root <joomla root relative to the home folder>
```

This creates `tours/` in the project with `tours.json` (a starter tour), `tours.mjs` and `install.php`. Everything stays in the project. Write the tours in `tours.json`:

- `prefix` scopes everything: only tours whose `uid` starts with it are installed or removed, core tours are never touched.
- Number the titles (`1. Welcome: ...`) and give them a negative `ordering`, so they sit above Joomla's own tours in the dropdown.
- `extensions` decides on which screens a tour is listed under "Take a tour": `com_cpanel` for the dashboard, `com_content` for articles, `com_media` for Media. "Show all tours" always lists every tour.
- `url` is the start screen. Each step has a `title`, a `description` (HTML), a CSS `target` (empty for a centred step), a `position`, a `type` and, for interactive steps, an `interactive_type` (names or Joomla's numbers both work).
- Write for the client: one action per step, "Click **X** and then Next" when the step needs a click before Next, and the house rules in the step where they matter. End form tours on **Close**/**Cancel** with a sentence that this closes without saving, so a practice run changes nothing.
- For tours that would change something real (editing an image overwrites it), give them a practice item: copy a photo to `images/tours/practice.jpg` over SSH and start the tour on its edit screen.
- Add a `test` hint to steps where the tester must type or pick something specific: `{"fill": "60"}`, `{"select": "3:2"}`, `{"choose": "Blog"}`.

## 4. Check, install, test

```bash
node tours/tours.mjs validate tours/tours.json  # validation only, no site access
node tours/tours.mjs check tours/tours.json     # validation + dry run on the site, rolled back
node tours/tours.mjs install tours/tours.json   # live: replaces all tours of the prefix
cd manual && node test-tours.mjs                # every tour, every step, as the test account
```

`install` writes to the live database: get the user's go-ahead the first time. Reinstalling deletes and recreates the tours, so their ids change; tell the user to reload the administrator before trying them.

`test-tours.mjs` starts each tour the way the dropdown does, clicks through every step, performs the interactive actions and reports steps whose target does not exist, did not get the tour highlight or showed another step. It writes a screenshot per step to `manual/tourtest/`. It never saves; afterwards nothing may be checked out (`node checkin.mjs <id>` releases a lock of the test account). Look at the screenshots too: a popup can attach correctly and still cover the field it explains; change `position` then.

Fix, `install` again and rerun the test until every tour passes. When the user tries a tour and reports it broken, reproduce it with `test-tours.mjs <uid>` before changing anything.

## 5. Report

Tell the user which tours there are and where they appear, what was written on the site (the tours, a practice file, the test account), how to remove them (`node tours/tours.mjs remove tours/tours.json`), and what is still open: removing the test account, and the core tours. Offer to hide Joomla's own tours from the client instead of unpublishing them: `UPDATE #__guidedtours SET access=6 WHERE uid LIKE 'joomla-%'` (6 is the Super Users access level on a default install; check `#__viewlevels`) keeps them for Super Users and also stops the "What's new" autostart for the client. A Joomla update adds a new "What's new" tour with Public access, so mention that it may need the same after the next update.
