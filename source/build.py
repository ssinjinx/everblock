#!/usr/bin/env python3
"""Inline all CSS/JS into a single self-contained dist/everblock.html and ../index.html (works from file://)."""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
def js(m):
    src = (root / m.group(1)).read_text().replace('</script', '<\\/script')
    return '<script>\n' + src + '\n</script>'
def css(m):
    return '<style>\n' + (root / m.group(1)).read_text() + '\n</style>'
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
out = root / 'dist' / 'everblock.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(out, out.stat().st_size, 'bytes')
page = root.parent / 'index.html'  # GitHub Pages entry point
page.write_text(html)
print(page, page.stat().st_size, 'bytes')
