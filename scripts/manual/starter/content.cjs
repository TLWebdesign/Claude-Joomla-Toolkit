// The text of the manual, in the client's language. Build with: node make.mjs
// Headings from h1/h2 appear in the table of contents. **bold** works in all text helpers.
// Red numbers in a screenshot are explained with legend() directly below the image.
const M = require('./doc.cjs');
const { add, h1, h2, p, steps, bullets, img, legend, tip, warn, table } = M;

add(h1('1. Logging in and finding your way'));
add(p('This manual helps you keep the website up to date yourself. The red numbers in the pictures match the numbered lines below each picture.'));
add(h2('The dashboard'));
add(img('a1-dashboard', { caption: 'The dashboard after logging in' }));
add(legend([
  ['1', '**Content**: the menu with everything you need.'],
  ['2', '**Articles**: all pages and news items.'],
  ['3', '**Media**: all images.'],
]));

M.build({
  out: 'out/' + require('./manual.config.json').fileName + '.docx',
  title: 'Website manual',
  subtitle: 'www.example.com',
  tagline: 'Keeping pages, news and images up to date yourself',
  version: 'Version 1.0',
  logo: null,            // 'logo' after running: node logo.mjs <logo url>
  coverImage: null,      // for example a screenshot of the home page
  footer: 'Website manual',
  author: '',
});
