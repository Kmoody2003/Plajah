#!/usr/bin/env python3
"""Convert a markdown file to PDF via Chrome headless."""
import sys, subprocess, pathlib, markdown, textwrap

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix('.pdf')

md_text = src.read_text(encoding='utf-8')

# Convert markdown → HTML (tables, fenced code, etc.)
md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc'])
body = md.convert(md_text)

html = textwrap.dedent(f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{src.stem}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');

  *, *::before, *::after {{ box-sizing: border-box; }}

  :root {{
    --bg: #0a080f;
    --surface: #110e1a;
    --surface2: #19152a;
    --border: rgba(255,255,255,0.10);
    --accent: #7c3aed;
    --accent2: #a855f7;
    --gold: #f59e0b;
    --text: #e8e3f0;
    --muted: #9ca3af;
    --green: #10b981;
    --red: #ef4444;
  }}

  @page {{
    size: A4;
    margin: 15mm 18mm 15mm 18mm;
    @bottom-center {{
      content: counter(page) " of " counter(pages);
      font-family: 'Inter', sans-serif;
      font-size: 8pt;
      color: #6b7280;
    }}
  }}

  html, body {{
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 10pt;
    line-height: 1.65;
    margin: 0;
    padding: 0;
  }}

  /* ── Cover block ── */
  h1:first-of-type {{
    font-size: 26pt;
    font-weight: 900;
    letter-spacing: -0.03em;
    color: #fff;
    margin: 0 0 4pt;
    line-height: 1.15;
    background: linear-gradient(135deg, #a855f7 0%, #7c3aed 40%, #4f46e5 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }}
  h2:first-of-type {{
    font-size: 12pt;
    font-weight: 400;
    color: var(--muted);
    margin: 0 0 16pt;
    letter-spacing: 0.01em;
  }}

  /* ── Section headings ── */
  h2 {{
    font-size: 14pt;
    font-weight: 700;
    color: #fff;
    margin: 22pt 0 6pt;
    padding-bottom: 4pt;
    border-bottom: 1.5pt solid rgba(124,58,237,0.4);
    page-break-after: avoid;
  }}
  h3 {{
    font-size: 11pt;
    font-weight: 600;
    color: var(--accent2);
    margin: 14pt 0 4pt;
    page-break-after: avoid;
  }}
  h4 {{
    font-size: 10pt;
    font-weight: 600;
    color: var(--gold);
    margin: 10pt 0 3pt;
  }}

  p {{
    margin: 0 0 7pt;
    orphans: 3;
    widows: 3;
  }}

  a {{
    color: var(--accent2);
    text-decoration: none;
  }}

  strong {{ color: #fff; font-weight: 600; }}
  em {{ color: var(--gold); font-style: normal; font-weight: 500; }}

  /* ── Tables ── */
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 12pt;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }}
  thead tr {{
    background: rgba(124,58,237,0.25);
  }}
  thead th {{
    text-align: left;
    padding: 5pt 7pt;
    font-weight: 700;
    font-size: 7.5pt;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent2);
    border-bottom: 1pt solid rgba(124,58,237,0.5);
  }}
  tbody tr {{
    border-bottom: 0.5pt solid var(--border);
  }}
  tbody tr:nth-child(even) {{
    background: rgba(255,255,255,0.025);
  }}
  tbody td {{
    padding: 4pt 7pt;
    vertical-align: top;
    color: var(--text);
  }}
  tbody td:first-child {{
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
  }}

  /* ── Lists ── */
  ul, ol {{
    margin: 4pt 0 8pt 18pt;
    padding: 0;
  }}
  li {{
    margin-bottom: 3pt;
  }}
  li > strong:first-child {{
    color: var(--accent2);
  }}

  /* ── Code ── */
  code {{
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 8pt;
    background: rgba(124,58,237,0.15);
    color: #c4b5fd;
    padding: 1pt 4pt;
    border-radius: 3pt;
  }}
  pre {{
    background: var(--surface2);
    border: 0.5pt solid var(--border);
    border-radius: 6pt;
    padding: 8pt 10pt;
    overflow-x: auto;
    font-size: 8pt;
    margin: 6pt 0 10pt;
    page-break-inside: avoid;
  }}
  pre code {{
    background: none;
    padding: 0;
    color: #d4c8f8;
  }}

  /* ── Blockquote ── */
  blockquote {{
    margin: 8pt 0;
    padding: 6pt 12pt;
    border-left: 3pt solid var(--accent);
    background: rgba(124,58,237,0.08);
    border-radius: 0 4pt 4pt 0;
    color: var(--muted);
    font-style: italic;
  }}

  /* ── Horizontal rule ── */
  hr {{
    border: none;
    border-top: 0.5pt solid rgba(255,255,255,0.12);
    margin: 14pt 0;
  }}

  /* ── Page breaks ── */
  h2 {{ page-break-before: auto; }}
  .page-break {{ page-break-after: always; }}

  /* ── Footer metadata ── */
  em:last-child {{
    font-size: 7.5pt;
    color: #4b5563;
    font-style: italic;
    display: block;
    margin-top: 12pt;
    border-top: 0.5pt solid var(--border);
    padding-top: 8pt;
  }}
</style>
</head>
<body>
{body}
</body>
</html>
""")

html_path = out.with_suffix('.html')
html_path.write_text(html, encoding='utf-8')

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
result = subprocess.run([
    chrome,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--disable-background-networking',
    f'--print-to-pdf={out.resolve()}',
    '--print-to-pdf-no-header',
    str(html_path.resolve())
], capture_output=True, text=True, timeout=60)

if result.returncode == 0:
    print(f"PDF written: {out.resolve()}")
else:
    print(f"Chrome stderr: {result.stderr[:500]}")
    sys.exit(1)
