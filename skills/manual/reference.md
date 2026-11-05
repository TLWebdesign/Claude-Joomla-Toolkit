# Joomla 6 administrator: selectors and traps for capture scripts

Tested on Joomla 6.1 and 6.2 with the Atum admin template, on sites with a Dutch administrator language. Labels follow the administrator language of the account; ids, `href` fragments and `data-*` attributes are the same in every language, so prefer those and look up the visible label when you need text. The locators below use the Dutch labels as tested; the glossary gives the English ones.

## Glossary of the labels used below

| English (Joomla) | Dutch, as used below |
|---|---|
| Content, Articles, Media, System | Inhoud, Artikelen, Media, Systeem |
| User Menu | Gebruikersmenu |
| Actions | Acties |
| Columns | Kolommen |
| Featured (status column) | Speciaal |
| Take a tour, Show all tours | Doe een rondleiding, Toon alle rondleidingen |
| What's new in Joomla, Hide forever | Wat is er nieuw in Joomla, Voorgoed verbergen |
| Cancel, Close | Annuleren, Sluiten |
| Save, Save & Close | Opslaan, Opslaan & Sluiten |
| Reveal or hide additional toolbar items | Extra werkbalkitems tonen of verbergen |
| Paste as text, Clear formatting, Insert/edit image | Plakken als tekst, Opmaak wissen, Afbeelding invoegen/bewerken |
| CMS Content: Read more, Media | CMS inhoud: Lees meer, Media |
| Class (image dialog) | Klasse |
| Versions: Restore, Preview, Compare | Versies: Herstellen, Voorbeeld, Vergelijken |
| Reset (image editor) | Herstellen |
| There are no articles in this category | Deze categorie bevat geen artikelen |

## Layout

| What | Locator |
|---|---|
| Sidebar menu item | `#sidebarmenu a[aria-label="Inhoud"]` (top level), `#sidebarmenu a[aria-label="Artikelen"]` |
| Dashboard quick icons | `.quickicon a[href*="view=articles"]`, `.quickicon a[href*="com_media"]` |
| User menu (top right) | `.header-item button` with text "Gebruikersmenu"; entries in `.dropdown-menu.show` |
| Toolbar button | `#toolbar button` filtered by text; New is `#toolbar-new` |
| Actions dropdown | `#toolbar-status-group button` with text "Acties" |
| Column chooser | `.dropdown.float-end button[data-bs-auto-close="false"]` ("9/9 Kolommen"); checkboxes in `.dropdown-menu.show` |
| Status column | `#articleList thead th:has(a[data-order="a.state"])`; do not count columns, the third one is "Speciaal" |
| Tours dropdown | `header .header-tours button.dropdown-toggle`, items `.header-tours .dropdown-menu button` |
| Custom dashboard modules | `#cpanel-modules .mod-custom`; a shortcut button is an `a.btn` with the edit or filter link |
| Edit toolbar | `#toolbar-apply`, `#toolbar-dropdown-save-group`, `#toolbar-cancel`, `#toolbar-versions`, `#toolbar-preview` |
| Article list | `#articleList tbody tr`; status toggle `.tbody-icon` (2nd in a row); lock `.icon-checkedout` |
| Search | `#filter_search`, press Enter |

The toolbar under the header is sticky and covers fields after scrolling. `openArticle()` and `unstick()` make it static.

## Article edit form

- Title `#jform_title`, alias `#jform_alias`, status `#jform_state`, category: the `joomla-field-fancy-select` that contains `#jform_catid`.
- **Choosing a category reloads the form** (to load the fields of that category). Click the option (`.choices__item--choice` with the category name) and wait for the navigation; typing plus Enter does not select it reliably.
- Editor: set content with `tinymce.get('jform_articletext').setContent(html)`. The read more line is `<hr id="system-readmore">`. The editor body is in an iframe: `page.frameLocator('.tox-edit-area iframe')`.
- Hidden toolbar buttons appear after clicking the button with aria-label "Extra werkbalkitems tonen of verbergen". Useful ones: "Plakken als tekst", "Opmaak wissen", "Afbeelding invoegen/bewerken". **CMS inhoud** is `button[data-mce-name="jxtdbuttons"]` (always visible); its items are `.tox-collection__item` ("Lees meer", "Media"). Move the mouse away (`page.mouse.move`) before a shot, or a tooltip stays in the picture.
- The image dialog is `.tox-dialog`; find fields by their label (`.tox-form__group` that has a `label` with the text) and the class list ("Klasse") as `.tox-listboxfield`. Select an image first: `ed.selection.select(ed.getBody().querySelector('img'))`.
- **CMS inhoud > Media** (6.2) opens the media picker in `dialog[open] iframe`. Work in that frame (`page.frameLocator('dialog[open] iframe')`): folders are `.media-tree a`, match the name exactly (`/^\s*fotos\s*$/`, because "fotos" also matches "blogfotos"); clicking a file shows "Aanvullende gegevens" (alt text, classes).
- A custom field's input is `#jform_com_fields_<name>`; its group tab is `aria-controls="attrib-fields-<group id>"`.
- A new article opened from a dashboard link with `&catid=<id>` already has that category, without the reload.
- Tabs: `page.getByRole('tab', { name, exact: true })`. Custom field groups are tabs named after the group.
- Close without saving: `Joomla.submitbutton('article.cancel')` (the button is "Annuleren" on new and "Sluiten" on existing articles).
- `process` and other Node globals do not exist inside `page.evaluate`/`$$eval`; pass values as the second argument.

## Custom fields

- A subform row is `.subform-repeatable-group`. Nested subforms (files inside a row) also use that class, so select direct rows carefully.
- `.group-add` inside a row: the **first** matching button of the row adds a row below it; the add button next to the field label adds a row at the top.
- `.group-remove` removes a row immediately; `.group-move` is the drag handle.
- Media fields: `joomla-field-media`; the picker opens in a `dialog` with an iframe (`page.frameLocator('dialog[open] iframe')`). Marks are drawn inside the open dialog automatically.
- Calendar fields accept typed dates in the site format (for example `12-01-2027`); the button next to the input opens the calendar.
- File upload fields of third-party field plugins may only work after the article has been saved once. Capture the message they show instead of saving.

## Media manager

- Items `.media-browser-item` filtered by file name; the actions toggle appears on hover (`.action-toggle`), actions in `.media-browser-actions-list`.
- Info panel: select an item, then the toolbar button with the info icon; panel `.media-infobar`.
- Clicking an empty spot deselects; do it before hovering another item.
- `option=com_media` redirects to `option=com_media&path=local-images:/`; open folders with `&path=local-images:/<folder>`.
- Image editor: `option=com_media&view=file&path=local-images:/<file>`. Fields `#jform_crop_quality`, `#jform_aspectRatio` (select by label, for example `3:2`), `#jform_resize_quality`, `#jform_resize_width`, `#jform_rotate_quality`; each tab has its own quality, starting at 80. Leave with Reset and then Close (`#toolbar-reset button`, `#toolbar-cancel button`) and accept the dialog that may ask about unsaved changes (`page.on('dialog', d => d.accept())`). Practice on a copy (`images/tours/practice.jpg`), never on a photo that is in use.

## Versions and locks

- "Versies" opens a dialog with an iframe; rows in `tbody tr`, buttons Herstellen/Voorbeeld/Vergelijken.
- To show a lock icon, open the article in a second browser context (same saved session) and screenshot the list from the first. Close the second context's form with `Promise.all([op.waitForNavigation(), op.evaluate(() => Joomla.submitbutton('article.cancel'))])`; without waiting for the navigation the context closes first and the article stays locked.

## Front end

- `launch({ loggedIn: false })` for visitors' views. Cassiopeia child templates often use section classes that can be clipped directly (for example `.homepage-kaarten`).
- A category page without published articles shows "Deze categorie bevat geen artikelen"; do not use that as a screenshot.

## Document traps

- Use PNG for screenshots; JPEG is larger for UI captures.
- Keep a legend number for every red mark, in the same order. Number marks in reading order (top to bottom), and use `{ side: 'tr' }` when two marked elements touch, or the numbers overlap.
- A clip that is a list of locators is their union plus a margin: handy for a button with its open menu.
- Word must not have the target `.docx` open when it is overwritten.
