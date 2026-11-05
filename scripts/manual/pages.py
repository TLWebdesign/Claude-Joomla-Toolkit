"""Find the page of every heading in the manual PDF and optionally render contact sheets.

Usage: pages.py <pdf> <chapters.json> <pages.json> [<preview dir>]
Prints {"pageCount": n, "pages": {...}, "missing": [...]} as JSON.
"""
import json
import os
import sys

import pymupdf

pdf, chapters_file, pages_file = sys.argv[1:4]
preview = sys.argv[4] if len(sys.argv) > 4 else None

doc = pymupdf.open(pdf)
chapters = json.load(open(chapters_file, encoding='utf-8'))
pages = {}
# Skip the cover and the table of contents; headings are searched in order, so a subheading
# with the same text as an earlier one resolves to the next occurrence.
start = 2
for heading in chapters:
    for i in range(start, len(doc)):
        if heading in doc[i].get_text():
            pages[heading] = i + 1
            start = i
            break
json.dump(pages, open(pages_file, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if preview:
    os.makedirs(preview, exist_ok=True)
    for f in os.listdir(preview):
        if f.startswith('sheet') and f.endswith('.png'):
            os.remove(os.path.join(preview, f))
    cols, rows, pw, ph = 4, 2, 300, 424
    for s in range(0, len(doc), cols * rows):
        sheet = pymupdf.open()
        page = sheet.new_page(width=pw * cols, height=ph * rows)
        for k in range(cols * rows):
            if s + k >= len(doc):
                break
            r = pymupdf.Rect((k % cols) * pw, (k // cols) * ph, (k % cols + 1) * pw, (k // cols + 1) * ph)
            page.show_pdf_page(r, doc, s + k)
            page.draw_rect(r, color=(0.7, 0.7, 0.7), width=0.5)
        page.get_pixmap(dpi=110).save(os.path.join(preview, f'sheet{s // (cols * rows) + 1}.png'))

print(json.dumps({'pageCount': len(doc), 'pages': pages, 'missing': [c for c in chapters if c not in pages]}))
