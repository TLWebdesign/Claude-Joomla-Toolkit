#!/usr/bin/env node
// Release articles that the test account left checked out (a crashed capture or tour test):
// open each one with the same account and close it without saving.
//   node checkin.mjs 72 [73 ...]
// Only releases locks of this account; locks of other people stay and are reported by checkedOut().
import { launch, openArticle, closeEdit, checkedOut } from './shoot.mjs';

const { browser, page } = await launch();
try {
  for (const id of process.argv.slice(2)) {
    await openArticle(page, Number(id));
    await closeEdit(page);
    console.log('Closed', id);
  }
} finally {
  const locked = await checkedOut(page);
  console.log('Still checked out:', locked.length ? locked : 'nothing');
  await browser.close();
}
