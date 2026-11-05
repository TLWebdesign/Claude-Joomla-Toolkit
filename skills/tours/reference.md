# Joomla 6.2 guided tours: behaviour, targets and traps

Found while building and testing six tours on a live Joomla 6.2.0 site (Atum, Manager account, Dutch administrator language). The tour script is `media/plg_system_guidedtours/js/guidedtours.js` (Shepherd); read it on the site when something behaves unexpectedly. Labels are quoted in English with the Dutch label in brackets where the Dutch one was what the tests saw.

## How a tour runs

- **Start**: the tour's `url` must equal the current address exactly (`rootFull + url`); otherwise the browser is sent there first. If that address redirects, the tour restarts forever. `option=com_media` redirects to `option=com_media&path=local-images:/`, so use the latter. Check the final URL of every start screen with a browser before using it.
- The tour's own title and description are shown first as an extra step with a **Start** button. Step numbering in the popup ("Step 3 of 19") counts that step too.
- **Progress survives page loads**: the current step index is kept in `sessionStorage`. When a page reloads (choosing a category reloads the article form) the tour continues at the same step.
- **Step types**:
  - `next`: shows the popup with Next.
  - `redirect`: on Next, the browser goes to the step's `url`.
  - `interactive` + `button` or `submit`: no Next button; clicking the target moves the tour on, also when the click opens another page. The click listener is only set on the **first** element that matches the target, so the target must point at one unique element. A click on a different element (another article title) does not move the tour on.
  - `interactive` + `text`: Next stays disabled until a `required` field has a value (the article title is required).
  - `interactive` + `other`, `select`, `checkbox_radio`: a Next button is shown; ask the client to do the action first ("Click the tab X and then Next").
- For steps that are not `redirect`, the step `url` is only informational; the step is shown on whatever page the client is on.
- Titles and descriptions may be plain text in the site language; they do not have to be language keys. Descriptions are HTML (`<p>`, `<strong>`, `<em>`, `<ul>`).
- `access` 1 (Public) shows the tour to everyone who can log in to the administrator. A Manager can run tours without access to com_guidedtours.
- Joomla's own "What's new" tours have `autostart` 1 and take priority on page load until the user hides them ("Hide forever", Dutch "Voorgoed verbergen").

## Targets that work (Joomla 6.2, Atum)

Targets are passed to `document.querySelector`: plain CSS only, no Playwright selectors. `:has()` works in current browsers and is handy for wrappers. The element must be visible when the step shows.

| What | Target |
|---|---|
| Dashboard quick icons | `.quickicon a[href*="view=articles"]`, `.quickicon a[href*="com_media"]` |
| Custom dashboard module with a shortcut button | `#cpanel-modules .mod-custom:has(a[href*="catid=10"])`; the button itself `a[href*="layout=edit&catid=10"]` |
| Header: tours, site link, user menu | `.header-tours`, `.header-item a[target="_blank"][href^="https://www.example.com"]`, `.header-profile` |
| Article list: search, filters | `#filter_search`, `.js-stools-btn-filter` |
| Article list: status column | `#articleList thead th:has(a[data-order="a.state"])` (do not count columns: `nth-child` hits "Featured") |
| Article list: first title | `#articleList tbody tr:first-child th a` (opens whatever article is on top) |
| Column chooser | `.dropdown.float-end button[data-bs-auto-close="false"]` |
| Toolbar | `#toolbar-new`, `#toolbar-apply`, `#toolbar-dropdown-save-group`, `#toolbar-cancel`, `#toolbar-versions` (existing articles only), `#toolbar-preview` |
| Title, alias, status | `#jform_title`, `#jform_alias`, `#jform_state` |
| Category | `joomla-field-fancy-select .choices[data-type=select-one]` |
| Editor | `.tox-tinymce` (whole editor) |
| CMS Content (Read more, Media) | `button[data-mce-name="jxtdbuttons"]` |
| Tabs | `button[role="tab"][aria-controls="images"]`, `...="publishing"`, `...="general"`; a custom field group tab is `attrib-fields-<group id>` |
| Custom field input | `#jform_com_fields_<field name>` |
| Intro and full-text image | `joomla-field-media:has(#jform_images_image_intro)`, `#jform_images_image_intro_alt`, same with `fulltext` |
| Publish dates | `#jform_publish_up`, `#jform_publish_down` |
| Media manager | `.media-sidebar`, `button[onclick*="onClickUpload"]`, `button[onclick*="onClickCreateFolder"]`, `#media_search`, `.media-toolbar-list-view`, `.media-browser` |
| Image editor | `#jform_crop_quality`, `#jform_aspectRatio`, `.cropper-container`, tabs `aria-controls="attrib-resize"` / `"attrib-rotate"`, `#jform_resize_width`, `#toolbar-reset`, `#toolbar-save`, `#toolbar-cancel` |

Cannot be targeted: the TinyMCE buttons behind "Reveal or hide additional toolbar items" (hidden until opened), the editor's own dialogs and menus (they only exist while open), native `<select>` options. Point at `.tox-tinymce` or the visible parent button and name the hidden button in the text.

## Site facts worth putting in the text

- TinyMCE profiles differ per user group (`plg_editors_tinymce` → `configuration.setoptions`). Check the client's set: `paste_as_text` (paste as plain text by default) and `img_classes_list` (custom image classes such as "Image left" `me-3 float-start` / "Image right" `ms-3 float-end`, shown in the image dialog under **Class**). The list also contains Joomla's own Left/Right/Center entries; tell the client which to use.
- In 6.2 the intro and full-text image have two separate class fields: `imgclass_*` (the img element) and `float_*` (the figure). Usually both stay empty.
- The image editor's quality starts at 80 on every tab (crop, resize and rotate each have their own field) and the aspect ratio list has no default; neither can be configured (only the list of ratios, in the plugin "Media Action - Crop"). House rules like "quality 60, 3:2" must be in the tour text, per tab.
- Saving in the image editor overwrites the original file; there is no "save as copy".
- `CMS Content > Media` (6.2) opens the media picker in a dialog with an iframe; after picking a file it shows an extra panel with alt text, classes and caption.
- A "Clean cache" button in the header comes from Regular Labs Cache Cleaner, not core; mention it only when it is installed.

## Database

- `#__guidedtours`: `uid` (unique key per tour), `extensions` (JSON array), `url`, `ordering`, `published`, `access`, `language`, `autostart`, plus created/modified columns that are NOT NULL.
- `#__guidedtour_steps`: `type` 0 next, 1 redirect, 2 interactive; `interactive_type` 1 submit, 2 text, 3 other, 4 button, 5 checkbox_radio, 6 select; `params` JSON or NULL (`required`, `requiredvalue`).
- `install.php` deletes the tours of the prefix and inserts them again in one transaction; `--dry-run` rolls back.
