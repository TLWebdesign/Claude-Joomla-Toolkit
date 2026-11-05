// Capture script example: one script per chapter keeps reruns short. Run with: node capture-01-basics.mjs
// Rules: never save. Leave every edit form with closeEdit() (Cancel/Close), also when something fails.
// Labels such as aria-label follow the administrator language of the test account ("Content" is
// "Inhoud" in Dutch); ids and href fragments are the same in every language.
import { launch, openArticle, closeEdit, tab, mark, unmark, shot, scrollTo, checkedOut, ADMIN, VIEW } from './shoot.mjs';

const { browser, page } = await launch();
try {
  // Dashboard with the menu items the client will use
  await page.goto(ADMIN);
  await page.waitForLoadState('networkidle');
  await mark(page, [
    [page.locator('#sidebarmenu a[aria-label="Content"]'), '1', { side: 'tr' }],
    [page.locator('.quickicon a[href*="view=articles"]'), '2'],
    [page.locator('.quickicon a[href*="com_media"]'), '3'],
  ]);
  await shot(page, 'a1-dashboard', { x: 0, y: 0, width: VIEW.width, height: 520 });
  await unmark(page);

  // An article form: open, mark, capture, close without saving
  await openArticle(page); // no id = new article
  await page.fill('#jform_title', 'Example title');
  await mark(page, [[page.locator('#jform_title'), '1'], [page.locator('.tox-tinymce'), '2'], [page.locator('#jform_alias'), '3']]);
  await shot(page, 'a2-new-article');
  await unmark(page);
} finally {
  if (page.url().includes('layout=edit')) await closeEdit(page);
  const locked = await checkedOut(page);
  if (locked.length) console.log('   ! still checked out:', locked);
  await browser.close();
}
