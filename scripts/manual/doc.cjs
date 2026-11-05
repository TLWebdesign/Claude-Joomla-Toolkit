// Building blocks for a Word (.docx) manual with screenshots, numbered legends, tip boxes and a
// table of contents with page numbers (make.mjs fills them in on the second build, from pages.py).
//
// Usage in content.cjs:
//   const M = require('./doc.cjs');
//   M.add(M.h1('1. Logging in'), M.p('Text with **bold**.'), M.img('a1-login', { caption: '...' }));
//   M.build({ out: 'out/Manual.docx', title: '...' });

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, LevelFormat,
  Footer, PageNumber, PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
  BorderStyle, ShadingType, Table, TableRow, TableCell, WidthType, TabStopType,
} = require('docx');

const WORK = process.cwd();
const CONFIG = JSON.parse(fs.readFileSync(path.join(WORK, 'manual.config.json'), 'utf8'));
const SHOTS = path.join(WORK, 'shots');
const PAGES_FILE = path.join(WORK, 'out', 'pages.json');
const PAGES = fs.existsSync(PAGES_FILE) ? JSON.parse(fs.readFileSync(PAGES_FILE, 'utf8')) : {};

const C = {
  primary: '173557', secondary: '2D9379', accent: 'E8914A', mark: 'E5392B', grey: '5B6573',
  tip: 'E8F4F0', warn: 'FDF1E7', ...(CONFIG.colors || {}),
};
const FONT = CONFIG.font || 'Arial';
const CONTENT_W = 9638; // A4 with 2 cm margins, in DXA
const LABELS = { toc: 'Inhoud', ...(CONFIG.labels || {}) };

const body = [];
const chapters = [];
// True between a heading and its first image: the heading, its intro text and the image are kept
// on one page, so a heading never ends up alone at the bottom of a page.
let chain = false;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// "Click **Save**" -> runs with bold parts
function runs(text, base = {}) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(part => part.startsWith('**')
    ? new TextRun({ text: part.slice(2, -2), bold: true, ...base })
    : new TextRun({ text: part, ...base }));
}

const add = (...xs) => xs.flat().forEach(x => body.push(x));

const h1 = text => {
  chapters.push({ text, level: 1 }); chain = true;
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(text)] });
};
const h2 = text => {
  chapters.push({ text, level: 2 }); chain = true;
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
};

const p = (text, opts = {}) => new Paragraph({
  children: runs(text), spacing: { after: 120, line: 300 }, keepNext: chain, keepLines: true, ...opts,
});

let stepInstance = 0;
function steps(items) {
  stepInstance++;
  return items.map(t => new Paragraph({
    children: runs(t), numbering: { reference: 'steps', level: 0, instance: stepInstance },
    keepNext: chain, keepLines: true, spacing: { after: 80, line: 290 },
  }));
}

const bullets = items => items.map((t, i) => new Paragraph({
  children: runs(t), numbering: { reference: 'bullets', level: 0 },
  keepNext: i < items.length - 1, keepLines: true, spacing: { after: 60, line: 290 },
}));

// Screenshot from shots/<name>.png, scaled to fit maxW x maxH points, with an optional caption.
function img(name, { maxW = 600, maxH = 560, caption } = {}) {
  const file = path.join(SHOTS, name + '.png');
  const { w, h } = pngSize(file);
  let width = maxW, height = Math.round(h * maxW / w);
  if (height > maxH) { height = maxH; width = Math.round(w * maxH / h); }
  const out = [new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 120, after: caption ? 40 : 160 }, keepNext: true,
    children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width, height },
      altText: { title: caption || name, description: caption || name, name } })],
  })];
  chain = false;
  if (caption) {
    out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, keepNext: true,
      children: [new TextRun({ text: caption, italics: true, size: 18, color: C.grey })] }));
  }
  return out;
}

// Explanation of the red numbers in the screenshot above: [['1', 'text'], ...]
function legend(items) {
  return items.map(([n, text], i) => new Paragraph({
    spacing: { after: 70, line: 290 }, indent: { left: 480, hanging: 480 },
    keepNext: i < items.length - 1, keepLines: true,
    tabStops: [{ type: TabStopType.LEFT, position: 480 }],
    children: [
      new TextRun({ text: ` ${n} `, bold: true, color: 'FFFFFF', shading: { type: ShadingType.CLEAR, fill: C.mark, color: 'auto' } }),
      new TextRun('\t'), ...runs(text),
    ],
  }));
}

function box(kind, title, lines) {
  chain = false;
  const fill = kind === 'tip' ? C.tip : C.warn;
  const bar = kind === 'tip' ? C.secondary : C.accent;
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W],
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
      margins: { top: 140, bottom: 100, left: 220, right: 220 },
      borders: { left: { style: BorderStyle.SINGLE, size: 24, color: bar }, top: none, bottom: none, right: none },
      children: [
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, color: bar })] }),
        ...lines.map(l => new Paragraph({ spacing: { after: 60, line: 280 }, children: runs(l) })),
      ],
    })] })],
  });
}
const tip = (title, ...lines) => [box('tip', title, lines), new Paragraph({ spacing: { after: 120 } })];
const warn = (title, ...lines) => [box('warn', title, lines), new Paragraph({ spacing: { after: 120 } })];

// Table with a coloured header row. widths in DXA must add up to at most 9638.
function table(head, rows, widths) {
  chain = false;
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9D3DE' };
  const row = (cells, isHead) => new TableRow({ tableHeader: isHead, cantSplit: true, children: cells.map((t, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: isHead ? { type: ShadingType.CLEAR, fill: C.primary, color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: runs(t, isHead ? { bold: true, color: 'FFFFFF' } : { size: 20 }) })],
  })) });
  return [new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [row(head, true), ...rows.map(r => row(r, false))],
  }), new Paragraph({ spacing: { after: 160 } })];
}

function cover({ title, subtitle, tagline, version, logo, coverImage }) {
  const out = [];
  if (logo) {
    const f = path.join(SHOTS, logo + '.png');
    const s = pngSize(f);
    out.push(new Paragraph({ spacing: { before: 1400, after: 600 }, children: [new ImageRun({
      type: 'png', data: fs.readFileSync(f), transformation: { width: 300, height: Math.round(300 * s.h / s.w) },
      altText: { title: 'Logo', description: 'Logo', name: 'logo' } })] }));
  } else {
    out.push(new Paragraph({ spacing: { before: 2400 } }));
  }
  out.push(new Paragraph({ spacing: { after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: C.secondary, space: 12 } },
    children: [new TextRun({ text: title, bold: true, size: 64, color: C.primary })] }));
  if (subtitle) out.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: subtitle, size: 32, color: C.secondary })] }));
  if (tagline) out.push(new Paragraph({ spacing: { after: 1200 }, children: [new TextRun({ text: tagline, size: 24, color: C.grey })] }));
  if (coverImage) out.push(...img(coverImage, { maxW: 560 }));
  if (version) out.push(new Paragraph({ spacing: { before: 600 }, children: [new TextRun({ text: version, size: 20, color: C.grey })] }));
  return out;
}

function toc() {
  return [
    new Paragraph({ pageBreakBefore: true, spacing: { after: 300 }, children: [new TextRun({ text: LABELS.toc, bold: true, size: 40, color: C.primary })] }),
    ...chapters.map(c => new Paragraph({
      spacing: { after: c.level === 1 ? 80 : 30, before: c.level === 1 ? 160 : 0 },
      indent: { left: c.level === 1 ? 0 : 400 },
      children: [
        new TextRun({ text: c.text, bold: c.level === 1, size: c.level === 1 ? 24 : 21, color: c.level === 1 ? C.primary : '333333' }),
        new TextRun({ children: [new PositionalTab({ alignment: PositionalTabAlignment.RIGHT, relativeTo: PositionalTabRelativeTo.MARGIN, leader: PositionalTabLeader.DOT })] }),
        new TextRun({ text: String(PAGES[c.text] ?? ''), size: c.level === 1 ? 24 : 21, bold: c.level === 1 }),
      ],
    })),
  ];
}

async function build({ out, title, subtitle, tagline, version, logo, coverImage, footer, author }) {
  const doc = new Document({
    creator: author || '', title,
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: '222222' } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 40, bold: true, color: C.primary, font: FONT },
          paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.secondary, space: 8 } } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, color: C.secondary, font: FONT },
          paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 1, keepNext: true } },
      ],
    },
    numbering: { config: [
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 360 } }, run: { bold: true, color: C.primary } } }] },
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 480, hanging: 300 } }, run: { color: C.secondary } } }] },
    ] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } }, titlePage: true },
      footers: {
        default: new Footer({ children: [new Paragraph({ children: [
          new TextRun({ text: footer || title, size: 16, color: C.grey }),
          new TextRun({ children: [new PositionalTab({ alignment: PositionalTabAlignment.RIGHT, relativeTo: PositionalTabRelativeTo.MARGIN, leader: PositionalTabLeader.NONE }), PageNumber.CURRENT], size: 16, color: C.grey }),
        ] })] }),
        first: new Footer({ children: [new Paragraph('')] }),
      },
      children: [...cover({ title, subtitle, tagline, version, logo, coverImage }), ...toc(), ...body],
    }],
  });
  fs.mkdirSync(path.dirname(path.resolve(WORK, out)), { recursive: true });
  fs.writeFileSync(path.resolve(WORK, out), await Packer.toBuffer(doc));
  fs.writeFileSync(path.join(WORK, 'out', 'chapters.json'), JSON.stringify(chapters.map(c => c.text)));
  console.log('Built', out, 'with', chapters.length, 'headings');
}

module.exports = { add, h1, h2, p, steps, bullets, img, legend, tip, warn, table, build, runs };
