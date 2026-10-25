"""Builds docs/design-system/design-system.html (and the PDF) from the live tokens.

The page links the app's real stylesheets (apps/web/src/index.css and
styles/components.css), so every swatch and component specimen is rendered by
the same CSS the product ships. Dark specimens use a `.theme-dark` scope that
re-declares the dark token block from index.css.

    python3 docs/design-system/build.py          # HTML + PDF (needs Google Chrome)
    python3 docs/design-system/build.py --html   # HTML only
"""

import html
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INDEX_CSS = ROOT / 'apps/web/src/index.css'
OUT_HTML = HERE / 'design-system.html'
OUT_PDF = HERE / 'Frugal-AI-Design-System.pdf'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

css = INDEX_CSS.read_text()


# ── Token helpers ───────────────────────────────────────────────────────────

def block(pattern: str) -> str:
    m = re.search(pattern, css, re.S)
    if not m:
        raise SystemExit(f'token block not found: {pattern}')
    return m.group(1)


light_root = block(r'\n:root \{\n(.*?)\n\}\n')
dark_root = block(r'@media \(prefers-color-scheme: dark\) \{\n  :root \{\n(.*?)\n  \}\n\}')
aliases = block(r'(  /\* ── 3\. App aliases.*?)\n\n  font-family')


def tokens(text: str) -> dict:
    return dict(re.findall(r'(--[\w-]+):\s*([^;]+);', text))


LIGHT = tokens(light_root)
DARK = {**LIGHT, **tokens(dark_root)}


def resolve(name: str, table: dict, depth: int = 0) -> str:
    value = table[name].strip()
    m = re.fullmatch(r'var\((--[\w-]+)\)', value)
    if m and depth < 8:
        return resolve(m.group(1), table, depth + 1)
    return value


def to_rgb(value: str, backdrop=(255, 255, 255)):
    value = value.strip()
    if value.startswith('#'):
        h = value[1:]
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    m = re.fullmatch(r'rgba?\(([^)]+)\)', value)
    if m:
        parts = [float(p) for p in m.group(1).replace('/', ',').split(',')]
        r, g, b = parts[:3]
        a = parts[3] if len(parts) > 3 else 1.0
        return tuple(round(c * a + bc * (1 - a)) for c, bc in zip((r, g, b), backdrop))
    raise ValueError(value)


def luminance(rgb):
    def ch(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    l1, l2 = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def ratio(fg_token: str, bg_token: str, table: dict) -> float:
    bg = to_rgb(resolve(bg_token, table))
    fg = to_rgb(resolve(fg_token, table), bg)
    return contrast(fg, bg)


def esc(s: str) -> str:
    return html.escape(s, quote=True)


# ── Content builders ────────────────────────────────────────────────────────

SYSTEM = ['red', 'orange', 'yellow', 'green', 'mint', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'brown']


def system_swatches() -> str:
    cells = []
    for name in SYSTEM:
        lt, dk = LIGHT[f'--sys-{name}'], DARK[f'--sys-{name}']
        cells.append(f'''
      <div class="sw">
        <div class="sw-chip" style="background:linear-gradient(90deg,{lt} 50%,{dk} 50%)"></div>
        <div class="sw-name">{name.capitalize()}</div>
        <div class="sw-val">{lt} · {dk}</div>
      </div>''')
    return '<div class="sw-grid">' + ''.join(cells) + '</div>'


def semantic_table(rows) -> str:
    out = ['<table class="spec"><thead><tr><th>Token</th><th>Role</th><th>Light</th><th>Dark</th></tr></thead><tbody>']
    for token, role in rows:
        lt, dk = resolve(token, LIGHT), resolve(token, DARK)
        out.append(f'''<tr><td><code>{token}</code></td><td>{esc(role)}</td>
          <td><span class="dot" style="background:{lt}"></span><code>{esc(lt)}</code></td>
          <td><span class="dot dot-dark" style="background:{dk}"></span><code>{esc(dk)}</code></td></tr>''')
    out.append('</tbody></table>')
    return ''.join(out)


def contrast_table() -> str:
    pairs = [
        ('--label-primary', '--bg-grouped-secondary', 'Primary text on a card'),
        ('--label-secondary', '--bg-grouped-secondary', 'Secondary text on a card'),
        ('--label-secondary', '--bg-grouped', 'Secondary text on the page'),
        ('--tint-text', '--bg-grouped-secondary', 'Tint text / links on a card'),
        ('--on-tint', '--tint-fill', 'White label on a filled button'),
        ('--status-positive', '--bg-grouped-secondary', 'Success (green) on a card'),
        ('--status-negative', '--bg-grouped-secondary', 'Negative amount / destructive (red) on a card'),
    ]
    out = ['<table class="spec"><thead><tr><th>Pair</th><th>Light</th><th>Dark</th><th>Needs</th></tr></thead><tbody>']
    for fg, bg, label in pairs:
        lt, dk = ratio(fg, bg, LIGHT), ratio(fg, bg, DARK)
        def cell(v):
            ok = 'pass' if v >= 4.5 else ('pass-large' if v >= 3 else 'fail')
            return f'<td class="{ok}">{v:.1f}:1</td>'
        out.append(f'<tr><td>{esc(label)}<br><code>{fg}</code> on <code>{bg}</code></td>{cell(lt)}{cell(dk)}<td>4.5:1</td></tr>')
    out.append('</tbody></table>')
    return ''.join(out)


TYPE = [
    ('Large Title', '--type-large-title', '34 / 41', 'Bold 700 · Figtree', '−0.02em', 'Page titles (h1), the net-worth hero'),
    ('Title 1', '--type-title-1', '28 / 34', 'Bold 700 · Figtree', '−0.015em', 'Sign-in headline'),
    ('Title 2', '--type-title-2', '22 / 28', 'Bold 700 · Figtree', '−0.01em', 'Wordmark, large section titles'),
    ('Title 3', '--type-title-3', '20 / 25', 'Semibold 600 · Figtree', '−0.01em', 'Card and sheet titles (h2)'),
    ('Headline', '--type-headline', '17 / 22', 'Semibold 600 · Inter', '−0.01em', 'Row titles, amounts, emphasis (h3)'),
    ('Body', '--type-body', '17 / 22', 'Regular 400 · Inter', '−0.01em', 'Default text, fields, list rows'),
    ('Callout', '--type-callout', '16 / 21', 'Regular 400 · Inter', '−0.008em', 'Sidebar links'),
    ('Subhead', '--type-subhead', '15 / 20', 'Regular 400 · Inter', '−0.006em', 'Buttons, chips, menu rows, banners'),
    ('Footnote', '--type-footnote', '13 / 18', 'Regular 400 · Inter', '0', 'Field labels, dates, section headers'),
    ('Caption 1', '--type-caption-1', '12 / 16', 'Regular 400 · Inter', '0', 'Chips, badges, weekday labels'),
    ('Caption 2', '--type-caption-2', '11 / 13', 'Regular 400 · Inter', '+0.005em', 'Smallest legal size (11pt minimum)'),
]


def type_scale() -> str:
    rows = []
    for name, token, size, weight, track, use in TYPE:
        rows.append(f'''
      <div class="type-row">
        <div class="type-sample" style="font:var({token})">{name}</div>
        <div class="type-meta"><b>{size}</b> pt/px · {weight}<br>tracking {track} · <code>{token}</code><br><span>{use}</span></div>
      </div>''')
    return ''.join(rows)


SPACING = [('--space-1', 4), ('--space-2', 8), ('--space-3', 12), ('--space-4', 16), ('--space-5', 24), ('--space-6', 32), ('--space-7', 48)]
RADII = [('--radius-xs', 6, 'Card thumbnails'), ('--radius-sm', 10, 'Fields, icon cells'), ('--radius-md', 14, 'List rows, menu rows, choices'),
         ('--radius-lg', 22, 'Cards, lists, menus'), ('--radius-xl', 26, 'Sidebar, auth panel, dropzone'), ('--radius-sheet', 34, 'Sheets (modals)'),
         ('--radius-full', 999, 'Buttons, chips, search, toggles')]


def spacing() -> str:
    return '<div class="space-grid">' + ''.join(
        f'<div class="space-item"><div class="space-bar" style="width:{px}px"></div><code>{t}</code><span>{px}px</span></div>' for t, px in SPACING) + '</div>'


def radii() -> str:
    return '<div class="radius-grid">' + ''.join(
        f'<div class="radius-item"><div class="radius-box" style="border-radius:var({t})"></div><code>{t}</code><span>{px if px < 999 else "capsule"}{"px" if px < 999 else ""} · {use}</span></div>'
        for t, px, use in RADII) + '</div>'


def spring_svg() -> str:
    pts = [(0, 0), (0.1, 0.226), (0.2, 0.536), (0.3, 0.75), (0.4, 0.873), (0.5, 0.938), (0.6, 0.971), (0.7, 0.986), (0.8, 0.994), (0.9, 0.997), (1, 1)]
    w, h, p = 300, 160, 20
    path = ' '.join(f'{"M" if i == 0 else "L"}{p + x * (w - 2 * p):.1f},{h - p - y * (h - 2 * p):.1f}' for i, (x, y) in enumerate(pts))
    ease = 'M20,140 C74,28 68,20 280,20'
    return f'''<svg viewBox="0 0 {w} {h}" class="spring">
      <line x1="20" y1="140" x2="280" y2="140" class="axis"/><line x1="20" y1="20" x2="20" y2="140" class="axis"/>
      <line x1="20" y1="20" x2="280" y2="20" class="target"/>
      <path d="{ease}" class="curve-ease"/>
      <path d="{path}" class="curve-spring"/>
      <text x="284" y="24">target</text><text x="200" y="156">time →</text>
    </svg>'''


# ── Page ────────────────────────────────────────────────────────────────────

dark_scope = '.theme-dark {\n' + dark_root.replace('    ', '  ') + '\n' + aliases + '\n  color: var(--text);\n  background: var(--bg);\n}\n'

CHEVRON = '<span class="field-select-chevron" aria-hidden="true">▾</span>'
CHIP_CHEV = '<span class="dropdown-trigger-chevron" aria-hidden="true">▾</span>'
ICON_INFO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>'
ICON_CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>'
ICON_BACK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>'
ICON_HOME = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>'
ICON_LIST = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/></svg>'
ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'


def txn_list() -> str:
    rows = [('Oct 12, 2026', 'Uber ride', [('Everyday Checking', ''), ('Transport', '')], '−$26.80', ''),
            ('Oct 12, 2026', 'Payroll — Acme Inc.', [('Everyday Checking', ''), ('Salary', '')], '$3,200.00', ' is-income'),
            ('Oct 11, 2026', 'Whole Foods weekly shop', [('Visa Platinum', ''), ('Uncategorized', ' txn-chip--category is-empty')], '−$54.71', '')]
    items = []
    for date, desc, chips, amt, cls in rows:
        chip_html = ''.join(f'<span class="txn-chip{c}"><span class="txn-chip-label">{esc(t)}</span></span>' for t, c in chips)
        items.append(f'''<li class="txn-item"><div class="txn-row is-static">
          <span class="txn-row-date">{date}</span>
          <span class="txn-row-description-cell"><span class="txn-row-description">{esc(desc)}</span></span>
          <span class="txn-row-chips">{chip_html}</span>
          <span class="txn-row-amount{cls}">{amt}</span></div></li>''')
    return '<ul class="txn-list">' + ''.join(items) + '</ul>'


CARD_FINISHES = [('Black', '#1c1c1e', 'Checking'), ('Navy', '#1e3a5f', 'Credit'), ('Maroon', '#6b1d2a', 'Credit'), ('Forest', '#1f4d3a', 'Savings'),
                 ('Graphite', '#48484a', 'Investment'), ('Slate', '#2f4858', 'Checking'), ('Bronze', '#7a5c3a', 'Cash'), ('Platinum', '#6e7781', 'Other')]


def card_bg(color: str) -> str:
    # Mirrors apps/web/src/lib/cardBackground.ts.
    sheen = 'radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 55%)'
    body = f'linear-gradient(to bottom left, color-mix(in srgb, {color} 84%, #ffffff) 0%, {color} 50%, color-mix(in srgb, {color} 70%, #000000) 100%)'
    return f'{sheen}, {body}'


def account_cards() -> str:
    cards = ''.join(
        f'<div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-start"><span class="account-card account-card--branded account-card--selected" style="background:{card_bg(c)};cursor:default;opacity:1;font-size:15px">'
        f'<span class="account-card-type">{t}</span><span class="account-card-name">{n}</span></span><code>{c}</code></div>'
        for n, c, t in CARD_FINISHES)
    return f'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.8rem;font-size:15px">{cards}</div>'


def component_gallery(theme: str) -> str:
    return f'''
<div class="{theme} specimen-pane">
  <div class="row">
    <button class="btn btn-primary">Save</button>
    <button class="btn btn-secondary">Cancel</button>
    <button class="btn btn-tinted">Add CSV profile</button>
    <button class="btn btn-danger">Delete</button>
    <button class="btn btn-primary" disabled>Disabled</button>
    <button class="text-button">Previous</button>
  </div>
  <div class="row">
    <button class="dropdown-trigger" aria-expanded="false">Range: Current month {CHIP_CHEV}</button>
    <button class="dropdown-trigger" aria-expanded="true">Category: Dining {CHIP_CHEV}</button>
    <div class="segmented"><button class="segmented-option is-selected">Real</button><button class="segmented-option">Nominal</button></div>
    <span class="badge badge-accent">Auto</span><span class="badge badge-neutral">Linked</span>
    <input type="checkbox" checked aria-label="Checked"><input type="checkbox" aria-label="Unchecked">
  </div>
</div>'''


PAGE = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Frugal AI Design System</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@500..800&family=Inter:opsz,wght@14..32,400..700&family=JetBrains+Mono:wght@400..600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../apps/web/src/index.css">
<link rel="stylesheet" href="../../apps/web/src/styles/components.css">
<style>
{dark_scope}
@page {{ size: Letter; margin: 0.55in 0.6in 0.65in; }}
* {{ animation: none !important; transition: none !important; }}
html:root, body {{ background: #ffffff; }}
body {{ font: var(--type-body); color: #111; letter-spacing: -0.01em; }}
h1.doc {{ font: var(--type-large-title); font-size: 2.6rem; letter-spacing: -0.03em; margin: 0 0 .4rem; }}
h2.doc {{ font: var(--type-title-1); letter-spacing: -0.02em; margin: 0 0 .35rem; padding-top: .2rem; }}
h3.doc {{ font: var(--type-title-3); margin: 1.3rem 0 .4rem; break-after: avoid; }}
h4.doc {{ font: var(--type-headline); margin: 1rem 0 .3rem; break-after: avoid; }}
.doc-rail {{ position: static !important; transform: none !important; visibility: visible !important; height: auto !important; margin: 0 !important; width: 12rem !important; }}
p, li {{ font: var(--type-callout); color: #222; }}
p.lede {{ font: var(--type-title-3); font-weight: 400; color: #444; letter-spacing: -0.01em; }}
.kicker {{ font: var(--type-footnote); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--accent-text); margin: 0 0 .3rem; }}
section {{ break-before: page; }}
.avoid {{ break-inside: avoid; }}
code {{ font-family: var(--font-mono); font-size: .78em; background: #f2f2f7; padding: .05em .3em; border-radius: 4px; }}
.cover {{ height: 9.6in; display: flex; flex-direction: column; justify-content: space-between; padding: .2in 0; }}
.cover-art {{ position: relative; height: 3.6in; border-radius: 34px; overflow: hidden; background: radial-gradient(circle at 20% 30%, #1e3a8a 0, transparent 48%), radial-gradient(circle at 80% 20%, #00c3d0 0, transparent 40%), radial-gradient(circle at 60% 85%, #ff2d55 0, transparent 45%), radial-gradient(circle at 15% 90%, #ffcc00 0, transparent 35%), #e6ebf7; }}
.cover-glass {{ position: absolute; inset: 22% 14%; border-radius: 34px; background: rgba(250,250,252,.55); backdrop-filter: blur(24px) saturate(180%); box-shadow: 0 8px 40px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.8); display: flex; align-items: center; justify-content: center; font: var(--type-large-title); font-size: 3.2rem; letter-spacing: -0.03em; color: #111; }}
.cover-meta {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; font: var(--type-footnote); color: #555; }}
.cover-meta b {{ display: block; color: #111; font: var(--type-headline); }}
.toc {{ columns: 2; column-gap: 2rem; padding: 0; list-style: none; }}
.toc li {{ display: flex; gap: .6rem; padding: .35rem 0; border-bottom: 1px solid #e5e5ea; break-inside: avoid; }}
.toc li b {{ color: var(--accent-text); width: 1.6rem; }}
.callout {{ background: var(--tint-soft); border-radius: var(--radius-lg); padding: .8rem 1rem; margin: .8rem 0; }}
.callout p {{ margin: .2rem 0; }}
.grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }}
.grid-3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: .8rem; }}
.principle {{ background: #f5f5f7; border-radius: var(--radius-md); padding: .7rem .85rem; break-inside: avoid; }}
.principle b {{ font: var(--type-headline); display: block; margin-bottom: .2rem; }}
.principle p {{ margin: 0; font: var(--type-subhead); color: #333; }}
.sw-grid {{ display: grid; grid-template-columns: repeat(6, 1fr); gap: .7rem; }}
.sw-chip {{ height: 54px; border-radius: 14px; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.12); }}
.sw-name {{ font: var(--type-subhead); font-weight: 600; margin-top: .3rem; }}
.sw-val {{ font: var(--type-caption-2); color: #666; font-family: var(--font-mono); }}
table.spec {{ width: 100%; border-collapse: collapse; margin: .5rem 0 1rem; font: var(--type-footnote); }}
table.spec th {{ text-align: left; font-weight: 600; color: #6c6c70; border-bottom: 1px solid #c6c6c8; padding: .35rem .4rem; }}
table.spec td {{ border-bottom: 1px solid #e5e5ea; padding: .35rem .4rem; vertical-align: middle; }}
table.spec tr {{ break-inside: avoid; }}
.dot {{ display: inline-block; width: 14px; height: 14px; border-radius: 50%; vertical-align: -3px; margin-right: .4rem; box-shadow: inset 0 0 0 .5px rgba(0,0,0,.25); background-color: #fff; }}
.dot-dark {{ outline: 3px solid #000; outline-offset: -3px; }}
td.pass {{ color: #008932; font-weight: 600; }} td.pass-large {{ color: #c55300; font-weight: 600; }} td.fail {{ color: #e9152d; font-weight: 600; }}
.type-row {{ display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; align-items: center; padding: .45rem 0; border-bottom: 1px solid #e5e5ea; break-inside: avoid; }}
.type-sample {{ color: #000; }}
.type-meta {{ font: var(--type-caption-1); color: #555; }} .type-meta span {{ color: #111; }}
.space-grid {{ display: flex; flex-direction: column; gap: .35rem; }}
.space-item {{ display: grid; grid-template-columns: 60px 100px 1fr; align-items: center; gap: .6rem; font: var(--type-footnote); }}
.space-bar {{ height: 14px; border-radius: 4px; background: var(--brand-navy); }}
.radius-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: .9rem; }}
.radius-item {{ display: flex; flex-direction: column; gap: .2rem; font: var(--type-caption-1); color: #555; }}
.radius-box {{ height: 70px; background: #f2f2f7; box-shadow: inset 0 0 0 1.5px var(--brand-navy); }}
.concentric {{ position: relative; width: 220px; height: 130px; border-radius: 26px; background: #f2f2f7; padding: 12px; box-shadow: inset 0 0 0 1px #c6c6c8; }}
.concentric div {{ height: 100%; border-radius: 14px; background: #fff; box-shadow: inset 0 0 0 1.5px var(--brand-navy); display: flex; align-items: center; justify-content: center; font: var(--type-footnote); color: #555; }}
.glass-stage {{ position: relative; height: 230px; border-radius: 26px; overflow: hidden; background: radial-gradient(circle at 15% 35%, #1e3a8a 0, transparent 40%), radial-gradient(circle at 75% 30%, #00c3d0 0, transparent 35%), radial-gradient(circle at 55% 95%, #ff8d28 0, transparent 40%), #f2f2f7; }}
.glass-stage .stripe {{ position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 46px, rgba(0,0,0,.18) 46px 52px); }}
.glass-card {{ position: absolute; top: 30px; height: 170px; width: 30%; border-radius: 34px; display: flex; align-items: flex-end; padding: 14px; font: var(--type-footnote); font-weight: 600; }}
.specimen-pane {{ border-radius: var(--radius-xl); padding: 1rem; background: var(--bg); display: flex; flex-direction: column; gap: .8rem; }}
.specimen-pane .row {{ display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; }}
.theme-light {{ background: var(--bg); }}
.spec-card {{ display: grid; grid-template-columns: 1.15fr 1fr; gap: 1rem; align-items: start; margin: .4rem 0 1.1rem; break-inside: avoid; }}
.spec-card .stage {{ border-radius: var(--radius-xl); background: var(--bg); padding: 1rem; }}
.spec-card ul {{ margin: .2rem 0; padding-left: 1.1rem; }}
.spec-card li {{ font: var(--type-footnote); color: #333; margin: .15rem 0; }}
.static-panel {{ position: static !important; animation: none !important; width: 100%; }}
.shot {{ width: 100%; border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.14), 0 0 0 .5px rgba(0,0,0,.12); }}
.shot-phone {{ width: 2.3in; border-radius: 26px; box-shadow: 0 8px 30px rgba(0,0,0,.14), 0 0 0 .5px rgba(0,0,0,.12); }}
figure {{ margin: .6rem 0 1rem; break-inside: avoid; }} figcaption {{ font: var(--type-footnote); color: #666; margin-top: .4rem; }}
svg.spring {{ width: 100%; max-width: 320px; }} svg.spring .axis {{ stroke: #c6c6c8; }} svg.spring .target {{ stroke: #c6c6c8; stroke-dasharray: 4 4; }}
svg.spring .curve-spring {{ fill: none; stroke: #1e3a8a; stroke-width: 3; }} svg.spring .curve-ease {{ fill: none; stroke: #aeaeb2; stroke-width: 2; stroke-dasharray: 5 4; }}
svg.spring text {{ font: 10px Inter; fill: #6c6c70; }}
.footer-note {{ font: var(--type-caption-1); color: #888; }}
</style></head>
<body>

<div class="cover">
  <div>
    <p class="kicker">Frugal AI · Design System · v1.0</p>
    <h1 class="doc">A calm, Apple-grade ledger.</h1>
    <p class="lede">The design system behind Frugal AI's look and feel: the research, the decisions, every token and every component, and how they were applied to the product.</p>
  </div>
  <div class="cover-art"><div class="cover-glass"><img src="../../apps/web/public/logo.png" alt="" style="height:1.15em;margin-right:.3em">Frugal AI</div></div>
  <div class="cover-meta">
    <div><b>Foundation</b>Apple iOS 26 Human Interface Guidelines, UIKit, iOS &amp; iPadOS 26 Figma kit</div>
    <div><b>Typography</b>Figtree + Inter, a Wealthsimple-style pairing on Apple's Dynamic Type scale</div>
    <div><b>Shipped in</b>apps/web/src/index.css (tokens) and styles/components.css (components). October 2026</div>
  </div>
</div>

<section>
  <p class="kicker">Contents</p>
  <h2 class="doc">What's inside</h2>
  <ol class="toc">
    <li><b>01</b>Research &amp; sources</li><li><b>02</b>Design system thinking</li><li><b>03</b>Principles</li>
    <li><b>04</b>Color</li><li><b>05</b>Typography</li><li><b>06</b>Layout, spacing &amp; shape</li>
    <li><b>07</b>Materials &amp; Liquid Glass</li><li><b>08</b>Motion</li><li><b>09</b>Components</li>
    <li><b>10</b>Accessibility</li><li><b>11</b>Applied to Frugal AI</li><li><b>12</b>Implementation &amp; governance</li>
  </ol>
  <div class="callout avoid"><p><b>How to read this document.</b> Every color swatch, type sample and component specimen here is rendered by the product's own stylesheets. Nothing was redrawn. If the CSS changes, rebuild this PDF with <code>python3 docs/design-system/build.py</code> and the document updates with it.</p></div>

  <p class="kicker" style="margin-top:1.4rem">01</p>
  <h2 class="doc">Research &amp; sources</h2>
  <p>The system started with three primary sources and one reference brand:</p>
  <div class="grid-2">
    <div class="principle"><b>Apple Human Interface Guidelines</b><p>Read from Apple's own documentation data: Color, Typography, Materials, Layout, Dark Mode, Accessibility, Motion, Buttons, Lists &amp; tables, Sheets, Toggles, Segmented controls, Tab bars, Sidebars, Text fields, Menus, Alerts, SF Symbols, Writing, Inclusion and Charting data. The system colors and type tables come from the HIG's specification tables (June 2025 iOS 26 values, updated Dec 2025 for Liquid Glass).</p></div>
    <div class="principle"><b>UIKit documentation</b><p>The semantic color API names (<code>label</code>, <code>secondaryLabel</code>, <code>systemGroupedBackground</code>, <code>systemFill</code>, <code>separator</code>…) became Frugal AI's token names, so a designer can say "secondary label" and mean exactly one thing.</p></div>
    <div class="principle"><b>iOS &amp; iPadOS 26 Figma kit</b><p>Apple's community kit, copied into the team's drafts and read through the Figma API: Colors (node 0:1746), Materials (215:105157), Buttons (507:24673), Lists (507:24675), Segmented controls (507:24683) and Sidebars (507:26013). It supplied the iOS 26 label, separator and background values and the Liquid Glass recipes.</p></div>
    <div class="principle"><b>Wealthsimple (typography reference)</b><p>wealthsimple.com uses The Future (headings), Wealthsimple Sans (interface) and Tiempos Text (editorial), all commercial or proprietary. Frugal AI uses the closest open equivalents: <b>Figtree</b> for display and <b>Inter</b> for text.</p></div>
  </div>
  <p>Apple's WWDC design sessions (<i>Designing Fluid Interfaces</i>, <i>The Details of UI Typography</i>, <i>Principles of Great Design</i>) informed the motion, tracking and principle sections.</p>
</section>

<section>
  <p class="kicker">02</p>
  <h2 class="doc">Design system thinking</h2>
  <p>Frugal AI's previous look as FinAI ("Night Ledger") had a strong personality but only a handful of loosely named colors, and those names did double duty: <code>--accent</code> was both a button fill and a text color, and <code>--border</code> was both a hairline and a field outline. The redesign replaces that with a <b>three-tier token architecture</b>. Each tier only talks to the one below it:</p>
  <div class="grid-3">
    <div class="principle"><b>1 · Primitives</b><p>Raw values Apple publishes: 12 system colors, their increased-contrast twins and six grays (<code>--sys-indigo</code>, <code>--sys-green-ic</code>, <code>--sys-gray-3</code>). Components never use these directly.</p></div>
    <div class="principle"><b>2 · Semantic</b><p>What a value means: <code>--bg-grouped</code>, <code>--label-secondary</code>, <code>--fill-tertiary</code>, <code>--separator</code>, <code>--tint-fill</code> vs <code>--tint-text</code>, <code>--status-positive</code>, <code>--glass-bg</code>, <code>--type-headline</code>, <code>--spring</code>.</p></div>
    <div class="principle"><b>3 · App aliases</b><p>The short names the components already used (<code>--bg</code>, <code>--surface</code>, <code>--text</code>, <code>--accent</code>, <code>--outflow</code>), now pointing at the semantic tier. The whole product changed without rewriting 190 inline styles.</p></div>
  </div>
  <h3 class="doc">Decisions that shaped the system</h3>
  <table class="spec">
    <thead><tr><th>Decision</th><th>Why</th></tr></thead><tbody>
    <tr><td><b>Grouped, card-based structure</b> (<code>#F2F2F7</code> page, white sections)</td><td>A finance app is lists of accounts and transactions. Apple's inset-grouped pattern (Settings, Wallet) is the most familiar way to scan grouped data, and it separates sections with background steps instead of borders.</td></tr>
    <tr><td><b>Frugal AI Navy as the accent</b> (<code>#1E3A8A</code>)</td><td>A brand color, not an Apple system color. The HIG supports this: in an app with mostly monochromatic content, a brand accent is "an effective way to tailor your app experience". Navy signals trust and steadiness for money, and stays clearly apart from the green used for money in. Like Apple's own colors it has a dark-mode pair: <code>--tint-fill</code> lifts to <code>#3256C8</code> so filled buttons stay visible on black with a white label ≥ 6:1, and <code>--tint-text</code> lifts to periwinkle <code>#8FA8FF</code> for text and icons. Increased-contrast twins are included.</td></tr>
    <tr><td><b>Color flags what needs attention</b></td><td>Money is neutral: <b>positive amounts and balances use the primary label color</b>, and <b>only negative amounts turn red</b> (<code>--outflow</code> = <code>--status-negative</code>). A screen full of green income read as noise. Keeping it plain lets the red stand out where it matters: spending, debt and below-zero balances. Green is reserved for success messages. The minus sign still carries direction, so color is never the only signal (HIG: Inclusive color).</td></tr>
    <tr><td><b>Accessible secondary label</b></td><td>Apple's 60%-alpha secondary label is about 3.5:1 on white, below the 4.5:1 HIG minimum for text up to 17pt. Frugal AI uses Apple's opaque increased-contrast gray (<code>#6C6C70</code> / <code>#AEAEB2</code>) so footnotes and dates pass everywhere.</td></tr>
    <tr><td><b>Liquid Glass only in the control layer</b></td><td>HIG: "Don't use Liquid Glass in the content layer." The sidebar, phone drawer, back button, menu button and popovers float in glass; cards, lists and fields stay solid.</td></tr>
    <tr><td><b>Capsules for controls, concentric radii for containers</b></td><td>iOS 26 makes buttons, chips and search bars capsules. Containers nest their radii concentrically (inner radius = outer radius − padding), so the corners never fight.</td></tr>
    <tr><td><b>Web-safe Apple typography</b></td><td>SF Pro can't be licensed for the web. Figtree and Inter follow Apple's Dynamic Type sizes, leading and size-specific tracking, and amounts use tabular figures instead of a monospace font.</td></tr>
    </tbody></table>
</section>

<section>
  <p class="kicker">03</p>
  <h2 class="doc">Principles</h2>
  <p>Apple's eight principles, translated into rules a Frugal AI designer can apply on a Tuesday afternoon.</p>
  <div class="grid-2">
    <div class="principle"><b>Purpose</b><p>Every screen answers one money question: how much do I have, where did it go, what needs attention. Anything that doesn't serve that answer doesn't ship.</p></div>
    <div class="principle"><b>Agency</b><p>People stay in control: imports always end on a review step, deletions offer Archive before Remove, and nothing is categorized without being shown.</p></div>
    <div class="principle"><b>Responsibility</b><p>Financial data is private and consequential. Destructive actions are red, never the primary button, and state their impact ("takes it off 49 transactions").</p></div>
    <div class="principle"><b>Familiarity</b><p>Use the patterns people already know from iOS: grouped lists, capsule buttons, sheets with a close control, a sidebar with tinted selection, a segmented control.</p></div>
    <div class="principle"><b>Flexibility</b><p>Light and dark follow the system setting (no in-app toggle). Increase Contrast, Reduce Transparency and Reduce Motion are honored. The layout reflows from a 1280px desktop to a 375px phone.</p></div>
    <div class="principle"><b>Simplicity</b><p>Hierarchy comes from weight, size and space, not from borders and boxes. One filled button per view; everything else is gray or plain.</p></div>
    <div class="principle"><b>Craft</b><p>Every value is a token, every token has a reason, and every reason is in this document. Tabular figures line up, hairlines are half-pixel, corners nest.</p></div>
    <div class="principle"><b>Delight</b><p>The result, not a layer on top: a glass sidebar that lets color drift beneath it, sheets that rise on a spring, a calm ledger that feels in control.</p></div>
  </div>
</section>

<section>
  <p class="kicker">04</p>
  <h2 class="doc">Color</h2>
  <h3 class="doc">System palette (primitives)</h3>
  <p>Apple's iOS 26 system colors. Each chip is split into light and dark. Increased-contrast twins (<code>-ic</code>) are used wherever a hue becomes text.</p>
  {system_swatches()}
  <h3 class="doc">Brand: Frugal AI Navy</h3>
  <p>The one color that isn't Apple's. Built to Apple's rules, with a light value, dark-mode lifts and increased-contrast twins.</p>
  <div class="sw-grid">{''.join(f'<div class="sw"><div class="sw-chip" style="background:{v}"></div><div class="sw-name">{n}</div><div class="sw-val">{v}</div></div>' for n, v in [('Navy', '#1e3a8a'), ('Dark fill', '#3256c8'), ('Dark text', '#8fa8ff'), ('IC navy', '#142a66'), ('IC dark fill', '#2a49b0'), ('IC dark text', '#b4c6ff')])}</div>
  <h3 class="doc">Logo</h3>
  <div class="spec-card" style="grid-template-columns:1.1fr 1fr">
    <div class="stage" style="display:flex;flex-direction:column;gap:.9rem">
      <div style="display:flex;align-items:center;gap:1.4rem">
        <img src="../../apps/web/public/logo.png" alt="" style="height:88px">
        <span class="app-logo" style="padding:0"><img src="../../apps/web/public/logo.png" alt="" class="app-logo-mark">Frugal AI</span>
      </div>
      <div class="theme-dark" style="border-radius:var(--radius-lg);padding:.8rem 1rem;display:flex;align-items:center;gap:1.2rem">
        <span class="app-logo" style="padding:0"><img src="../../apps/web/public/logo.png" alt="" class="app-logo-mark">Frugal AI</span>
        <img src="../../apps/web/public/icons/icon-192.png" alt="" style="height:44px;border-radius:10px">
        <img src="../../apps/web/public/favicon-32.png" alt="" style="height:16px">
      </div>
    </div>
    <ul><li><b>Mark:</b> the navy piggy bank with a gold coin. Its blues sit in the Frugal AI Navy family, and the coin's gold echoes the card chip.</li>
      <li><b>Lock-up:</b> the mark sits left of the Title 2 wordmark, at 30px tall with an 8px gap (<code>.app-logo</code>, <code>.app-logo-mark</code>), in the sidebar and phone top bar. Sign-in stacks the mark (44px) above the name.</li>
      <li><b>Files</b> (<code>apps/web/public/</code>): <code>logo.png</code> (UI), <code>favicon.ico</code> plus 16/32/48 PNGs, <code>apple-touch-icon.png</code> (180), and <code>icons/icon-192.png</code> / <code>icon-512.png</code> (PWA, on a <code>#F2F2F7</code> tile).</li>
      <li>Works on light and dark without a variant. Don't recolor or stretch it, and keep at least a quarter of its width as clear space.</li></ul>
  </div>
  <h3 class="doc">Semantic tokens</h3>
  {semantic_table([
    ('--bg-grouped', 'Page background'),
    ('--bg-grouped-secondary', 'Cards, lists, sections (alias --surface)'),
    ('--bg-elevated', 'Sheets and raised surfaces (alias --surface-raised)'),
    ('--label-primary', 'Primary text (alias --text)'),
    ('--label-secondary', 'Secondary text; accessible opaque gray (alias --text-muted)'),
    ('--label-tertiary', 'Placeholders, disabled, chevrons'),
    ('--fill-tertiary', 'Field, chip and gray-button fill'),
    ('--fill-quaternary', 'Row hover, choice backgrounds'),
    ('--separator', 'Hairlines between rows'),
    ('--separator-opaque', 'Dashed or high-contrast outlines'),
    ('--tint-fill', 'Filled buttons, selection, checkboxes (alias --accent)'),
    ('--tint-text', 'Links, tinted text and icons (alias --accent-text)'),
    ('--status-positive', 'Success messages only (alias --success)'),
    ('--status-negative', 'Negative amounts, destructive, below zero (alias --danger, --outflow)'),
  ])}
</section>

<section>
  <h3 class="doc" style="margin-top:0">Contrast, measured</h3>
  <p>Computed from the shipped tokens (WCAG 2.x relative luminance). HIG minimum: 4.5:1 for text up to 17pt, 3:1 for 18pt+ or bold.</p>
  {contrast_table()}
  <div class="callout avoid"><p><b>Why two tints?</b> Filled controls need a white label at ≥ 4.5:1 on the fill, while text needs the fill color at ≥ 4.5:1 on a dark card. Navy can't do either on a black page, so dark mode lifts it twice: <code>--tint-fill</code> to a mid navy <code>#3256C8</code> (white label 6.4:1, and still visible against black) and <code>--tint-text</code> to periwinkle <code>#8FA8FF</code> (7:1 on a card). In light mode one navy, <code>#1E3A8A</code>, does both (10:1 on white).</p></div>
  <h3 class="doc">Charts</h3>
  <p>The categorical series leads with Frugal AI Navy, then Apple hues in a fixed order (navy, orange, teal, gold, pink, green, purple, brown). Assign them in sequence and never cycle within a chart's first eight series, so neighbouring categories stay distinguishable for common color-vision differences.</p>
  <div class="row" style="display:flex;gap:.5rem">{''.join(f'<div style="flex:1;height:28px;border-radius:8px;background:var(--series-{i})"></div>' for i in range(1, 9))}</div>
</section>

<section>
  <p class="kicker">05</p>
  <h2 class="doc">Typography</h2>
  <p><b>Figtree</b> (display), a geometric sans close to Wealthsimple's The Future, sets titles. <b>Inter</b> (text), the open neo-grotesque nearest Wealthsimple Sans and Apple's SF Pro, sets everything else. Sizes, leading and weights are Apple's Dynamic Type "Large" defaults (17pt body, 11pt minimum). Tracking tightens as display sizes grow and stays near zero for text, following SF's tracking tables. Money uses <code>font-variant-numeric: tabular-nums</code> so columns align without a monospace font.</p>
  {type_scale()}
</section>

<section>
  <p class="kicker">06</p>
  <h2 class="doc">Layout, spacing &amp; shape</h2>
  <div class="grid-2">
    <div><h3 class="doc" style="margin-top:0">4-point spacing grid</h3>{spacing()}
      <p style="margin-top:.8rem">Hit targets: <b>44 × 44pt minimum</b> (<code>--hit-min</code>). Controls are 36px on desktop and grow to 44px on touch screens (<code>@media (pointer: coarse)</code>). Fields are 44px everywhere.</p></div>
    <div><h3 class="doc" style="margin-top:0">Concentric corners</h3>
      <div class="concentric"><div>inner 14 = 26 − 12</div></div>
      <p>An inner radius equals the outer radius minus the padding between them, so nested shapes share a center (iOS 26). Example: the sidebar (26) with 12px padding holds links at 14.</p></div>
  </div>
  <h3 class="doc">Radius scale</h3>
  {radii()}
  <h3 class="doc">Structure</h3>
  <p>A floating sidebar (15rem) on the left, page content on the grouped background with a Large Title, cards (<code>.card</code>) for sections, and inset grouped lists for data. Below 768px the sidebar becomes a glass drawer opened from a 44pt menu button, and filter chips wrap.</p>
</section>

<section>
  <p class="kicker">07</p>
  <h2 class="doc">Materials &amp; Liquid Glass</h2>
  <p>Two families, used for different layers (HIG &gt; Materials):</p>
  <div class="glass-stage avoid"><div class="stripe"></div>
    <div class="glass-card" style="left:4%;background:var(--glass-bg);backdrop-filter:var(--glass-filter);box-shadow:var(--glass-shadow), inset 0 1px 0 var(--glass-edge)">Liquid Glass · regular<br>72% · blur 24 · sat 180%</div>
    <div class="glass-card" style="left:36%;background:var(--glass-bg-strong);backdrop-filter:var(--glass-filter);box-shadow:var(--glass-shadow), inset 0 1px 0 var(--glass-edge)">Glass · strong (menus)<br>90% for text legibility</div>
    <div class="glass-card" style="left:68%;color:#fff;background:rgba(44,44,48,.62);backdrop-filter:var(--glass-filter);box-shadow:0 8px 40px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.1)">Glass · dark<br>62% · same filter</div>
  </div>
  <table class="spec avoid"><thead><tr><th>Material</th><th>Recipe (from the Figma kit)</th><th>Frugal AI uses it for</th></tr></thead><tbody>
    <tr><td><b>Liquid Glass, regular</b></td><td>Light: <code>rgba(245,245,245,.6)</code> over a color-dodge layer, shadow <code>0 8 40 rgba(0,0,0,.12)</code>. Dark: 67% of a <code>rgba(0,0,0,.6)</code> stack. Web: <code>--glass-bg</code> + <code>blur(24px) saturate(180%)</code> + a bright inner top edge.</td><td>Sidebar, phone drawer, back button, menu button</td></tr>
    <tr><td><b>Glass, strong</b></td><td>The regular variant at ~90% opacity. The HIG says to use the regular, more opaque variant for components with a lot of text (popovers, sidebars).</td><td>Menus, pickers, calendar popovers</td></tr>
    <tr><td><b>Standard material, regular</b></td><td>Light: <code>blur 50 + rgba(255,255,255,.6)</code>. Dark: <code>blur 50 + rgba(0,0,0,.41)</code>.</td><td><code>--material-thin</code> (content-layer overlays)</td></tr>
    <tr><td><b>Scrim</b></td><td>HIG: dim bright content 35% behind clear glass and modals.</td><td>Sheet backdrop, drawer backdrop</td></tr>
  </tbody></table>
  <p><b>Rules.</b> Never stack glass on glass. Never use glass for content (cards, rows, fields). With <code>prefers-reduced-transparency</code>, glass becomes the solid elevated background. With <code>prefers-contrast: more</code>, glass rises to 94–98% opacity. The phone top bar uses a scroll-edge hairline instead of a hard divider.</p>
</section>

<section>
  <p class="kicker">08</p>
  <h2 class="doc">Motion</h2>
  <div class="grid-2">
    <div>
      <p>Apple's fluid-interface guidance: respond on press, keep motion brief and interruptible, and prefer springs to fixed curves. CSS can't run a live spring, so Frugal AI samples Apple's default UI spring (<b>damping 1.0, response 0.35s</b>, critically damped, no overshoot) into a <code>linear()</code> curve: <code>--spring</code>.</p>
      <table class="spec"><tbody>
        <tr><td><code>--duration-fast</code></td><td>120ms</td><td>Hover, press, color changes</td></tr>
        <tr><td><code>--duration-base</code></td><td>250ms</td><td>Popovers, chevrons, segmented thumb</td></tr>
        <tr><td><code>--duration-spring</code></td><td>500ms</td><td>Sheets, drawer, progress bars</td></tr>
        <tr><td><code>--ease-out</code></td><td colspan="2">cubic-bezier(.2,.8,.2,1) for small state changes</td></tr>
      </tbody></table>
    </div>
    <div>{spring_svg()}<p class="footer-note">Navy: <code>--spring</code> (critically damped). Gray dashed: a typical ease curve for comparison. The spring arrives fast and settles without overshoot.</p></div>
  </div>
  <h3 class="doc">Choreography</h3>
  <ul>
    <li><b>Press:</b> buttons, chips and choices scale to 0.97 on <code>:active</code>, giving feedback on pointer-down rather than on release.</li>
    <li><b>Popovers materialize</b> from their trigger: scale 0.96 → 1 with a fade, transform origin at the source edge.</li>
    <li><b>Sheets rise</b> 24px and fade in on <code>--spring</code>. The drawer enters and leaves along the same edge (spatial consistency).</li>
    <li><b>Reduce Motion:</b> every animation and transition collapses to an instant change (<code>prefers-reduced-motion</code>), and nothing depends on motion to communicate.</li>
  </ul>
</section>

<section>
  <p class="kicker">09</p>
  <h2 class="doc">Components</h2>
  <p>Live specimens rendered by <code>components.css</code>, in light and dark.</p>
  {component_gallery('theme-light')}
  <div style="height:.8rem"></div>
  {component_gallery('theme-dark')}

  <h3 class="doc">Buttons <code>.btn</code></h3>
  <div class="spec-card">
    <div class="stage"><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="btn btn-primary">Import 9 transactions</button><button class="btn btn-secondary">Back</button><button class="btn btn-tinted">Add CSV profile</button><button class="btn btn-danger">Remove permanently</button></div></div>
    <ul><li><b>Filled</b> <code>.btn-primary</code>: the one most likely action per view (HIG: use style, not size, to rank choices).</li>
      <li><b>Gray</b> <code>.btn-secondary</code>: default and Cancel. <b>Tinted</b> <code>.btn-tinted</code>: emphasis without competing with Filled.</li>
      <li><b>Destructive</b> <code>.btn-danger</code>: red tint, solid red on hover. Never the primary role.</li>
      <li>Capsule, Subhead 15/600, 36px tall (44px on touch), press scale 0.97, disabled 40%.</li></ul>
  </div>

  <h3 class="doc">Fields <code>input</code> · <code>.field-select</code> · date</h3>
  <div class="spec-card">
    <div class="stage" style="display:flex;flex-direction:column;gap:.6rem">
      <label>Description<input type="text" value="Whole Foods weekly shop"></label>
      <label>Category<div class="field-select"><button class="field-select-trigger"><span class="field-select-value">Groceries</span>{CHEVRON}</button></div></label>
      <label>Account<div class="field-select"><button class="field-select-trigger is-empty"><span class="field-select-value">Select an account</span>{CHEVRON}</button></div></label>
    </div>
    <ul><li>Apple grouped-form fields: <code>--fill-tertiary</code> background, no border, 10pt corners, 44px tall, Body 17.</li>
      <li>Focus: the field turns to the surface color with a tint border and a 4px tint ring (<code>--focus-ring</code>).</li>
      <li>Labels sit above in Footnote/500, secondary label color. Placeholder text uses <code>--label-tertiary</code>.</li>
      <li>Select and date fields share the trigger and open glass popovers (no native controls anywhere).</li></ul>
  </div>

  <h3 class="doc">Menus &amp; filter chips <code>.dropdown</code></h3>
  <div class="spec-card">
    <div class="stage" style="min-height:220px">
      <button class="dropdown-trigger" aria-expanded="true">Category: Dining {CHIP_CHEV}</button>
      <div class="dropdown-panel static-panel" style="margin-top:.4rem;max-width:15rem">
        <label class="dropdown-item"><input type="checkbox">Coffee</label>
        <label class="dropdown-item"><input type="checkbox" checked>Dining</label>
        <label class="dropdown-item"><input type="checkbox">Groceries</label>
        <div class="dropdown-footer"><button>Clear</button><button>Done</button></div>
      </div>
    </div>
    <ul><li>Triggers are gray capsules (Apple's pop-up button) reading "Label: Value".</li>
      <li>Panels are strong-glass popovers, 22pt corners, 6px inset, rows highlighting on <code>--fill-tertiary</code> at 14pt (concentric).</li>
      <li>Selection uses Apple's round checkmark. Footer actions are plain tint buttons.</li>
      <li>Keyboard: arrows, Home/End, Enter/Space, type-ahead, Escape (closes only the menu, never the sheet around it).</li></ul>
  </div>

  <h3 class="doc">Calendar <code>.date-panel</code></h3>
  <div class="spec-card">
    <div class="stage">
      <div class="dropdown-panel date-panel static-panel" style="max-width:18rem">
        <div class="date-panel-head"><button class="date-panel-nav">‹</button><span class="date-panel-title">October 2026</span><button class="date-panel-nav">›</button></div>
        <div class="date-grid">{''.join(f'<span class="date-grid-weekday">{d}</span>' for d in ['Su','Mo','Tu','We','Th','Fr','Sa'])}{''.join(f'<button class="date-grid-day is-outside">{d}</button>' for d in [27,28,29,30])}{''.join(f'<button class="date-grid-day{" is-today" if d==23 else ""}{" is-selected" if d==12 else ""}">{d}</button>' for d in range(1,32))}</div>
      </div>
    </div>
    <ul><li>Circular day cells, Subhead with tabular figures.</li><li>Today: tint text, semibold. Selected: tint-filled circle with a white label.</li><li>Weekdays in uppercase Caption, tertiary label. Days outside the month are tertiary.</li><li>Arrows move by day or week, PageUp/PageDown by month.</li></ul>
  </div>
</section>

<section>
  <h3 class="doc" style="margin-top:0">Account cards <code>.account-card</code></h3>
  <div class="spec-card" style="grid-template-columns:1fr">
    <div class="stage">{account_cards()}</div>
    <ul><li>Eight sober finishes, the tones real bank cards use: black, navy, maroon, forest, graphite, slate, bronze and platinum (<code>CARD_COLOR_PALETTE</code>). All carry white text at ≥ 4.5:1. People can still pick a custom colour or upload a photo.</li>
      <li>Drawn like a real card: a soft sheen top-right, the colour through the middle, darker bottom-left under the name.</li>
      <li>An EMV chip (gold contact plate, CSS only) sits left of centre, as on a real card. Photo cards skip it because the photo already shows one.</li>
      <li>ID-1 proportions (1.586:1) in the large preview. Selected cards lift with a navy ring only when the selection is narrowed.</li></ul>
  </div>

  <h3 class="doc" style="margin-top:0">Lists <code>.txn-list</code></h3>
  <div class="spec-card" style="grid-template-columns:1.6fr 1fr">
    <div class="stage">{txn_list()}</div>
    <ul><li>An inset grouped list: one section with 22pt corners and rows separated by inset half-pixel hairlines. No per-row tiles.</li>
      <li>Row: date (Footnote, tabular), description (Body/500), chips (Caption, gray capsules), amount (Headline, tabular).</li>
      <li>Positive amounts and income use money-in green #358C15 (<code>--amount-positive</code>); negative amounts are red (<code>--outflow</code>). Net worth stays neutral.</li>
      <li>Uncategorized: an outlined capsule. Hover: quaternary fill. 44px minimum row height.</li></ul>
  </div>

  <h3 class="doc">Cards, notices &amp; banners</h3>
  <div class="spec-card">
    <div class="stage" style="display:flex;flex-direction:column;gap:.6rem">
      <div class="card"><div style="font:var(--type-headline)">All accounts</div><div style="font:var(--type-footnote);color:var(--text-muted)">Every transaction, across every account.</div><div class="mono" style="font:var(--type-large-title);letter-spacing:-.02em">$51,062.64</div></div>
      <button class="notice-box"><span class="notice-box-icon">{ICON_INFO}</span><span class="notice-box-text">You have 193 uncategorized transactions<span>Tap to categorize them</span></span><span class="notice-box-chevron">{ICON_CHEV}</span></button>
      <div class="alert alert-error" style="margin:0">Couldn't import row 4: the date isn't valid.</div>
    </div>
    <ul><li><b>Card</b> <code>.card</code>: a grouped section with 22pt corners and no border (the background step separates it).</li>
      <li><b>Notice</b> <code>.notice-box</code>: a tappable tip row with a tint-soft background, tint icon and disclosure chevron.</li>
      <li><b>Banner</b> <code>.alert</code>: tinted, borderless inline status. Apple reserves modal alerts for critical, actionable moments.</li></ul>
  </div>

  <h3 class="doc">Sheet <code>.sheet</code></h3>
  <div class="spec-card">
    <div class="stage"><div class="sheet" style="width:100%;box-shadow:var(--shadow-md)"><div class="sheet-body" style="padding:1.1rem">
      <div class="sheet-header"><h2 class="sheet-title">Delete "Transport"?</h2><button class="sheet-close">{ICON_CLOSE}</button></div>
      <p style="margin:0;font:var(--type-subhead);font-weight:600">Are you sure?</p>
      <p style="margin:0;font:var(--type-footnote);color:var(--text-muted)"><b style="color:var(--text)">Archive</b>: hides it from category pickers.</p>
      <div style="display:flex;justify-content:flex-end;gap:.5rem"><button class="btn btn-danger">Remove permanently</button><button class="btn btn-primary">Archive</button></div>
    </div></div></div>
    <ul><li>Apple's sheet radius (34pt), elevated background, large shadow and a 35% scrim behind.</li>
      <li>Title 3 header with a 30pt gray close circle (44pt on touch).</li>
      <li>Primary action trailing, Cancel or destructive leading (HIG: Alerts &gt; Buttons). Rises in on <code>--spring</code>.</li></ul>
  </div>
</section>

<section>
  <h3 class="doc" style="margin-top:0">Navigation: sidebar, back &amp; segmented</h3>
  <div class="spec-card">
    <div class="stage" style="display:flex;gap:1rem;align-items:flex-start">
      <div class="app-rail doc-rail">
        <span class="app-logo">Frugal AI</span>
        <nav class="app-rail-nav"><a class="app-rail-link">{ICON_HOME}<span>Home</span></a><a class="app-rail-link active">{ICON_LIST}<span>Transaction</span></a></nav>
      </div>
      <div style="display:flex;flex-direction:column;gap:.8rem;align-items:flex-start">
        <button class="back-button">{ICON_BACK}</button>
        <div class="segmented"><button class="segmented-option is-selected">Auto</button><button class="segmented-option">Manual</button></div>
      </div>
    </div>
    <ul><li><b>Sidebar</b> <code>.app-rail</code>: floating Liquid Glass, 8px inset, 26pt corners. Links are Callout/500 with tint icons, and the selected link gets a tint-soft background.</li>
      <li><b>Back</b> <code>.back-button</code>: a 44pt glass circle, the iOS 26 toolbar back button.</li>
      <li><b>Segmented</b> <code>.segmented</code>: a gray capsule track with a raised thumb on the selected segment. Equal segments, noun labels, at most five on a phone.</li>
      <li><b>Search</b> <code>.search-input</code>: a capsule search bar with a filled clear button (see the Transaction screenshot).</li></ul>
  </div>
  <h3 class="doc">Component inventory</h3>
  <table class="spec avoid"><thead><tr><th>Component</th><th>Class / file</th><th>Apple reference</th></tr></thead><tbody>
    <tr><td>Button</td><td><code>.btn</code> · Button.tsx</td><td>Buttons (filled / gray / tinted / destructive)</td></tr>
    <tr><td>Text field</td><td><code>input</code> · index.css</td><td>Text fields (grouped form)</td></tr>
    <tr><td>Select / date / suggest</td><td><code>.field-select</code> · FieldSelect, FieldDatePicker, SuggestInput</td><td>Pop-up buttons, date pickers</td></tr>
    <tr><td>Filter chip + menu</td><td><code>.dropdown</code> · SelectDropdown, MultiSelectDropdown, DatePickerDropdown</td><td>Menus, popovers</td></tr>
    <tr><td>Checkbox</td><td><code>input[type=checkbox]</code></td><td>Toggles (checkmark style)</td></tr>
    <tr><td>Segmented control</td><td><code>.segmented</code> · SegmentedControl.tsx</td><td>Segmented controls</td></tr>
    <tr><td>Card / section</td><td><code>.card</code> · Card.tsx</td><td>Lists (inset grouped)</td></tr>
    <tr><td>Account card</td><td><code>.account-card</code>, <code>.account-card-face</code> · AccountCarousel, AccountCardFace</td><td>Wallet passes (card art)</td></tr>
    <tr><td>Transaction list</td><td><code>.txn-list</code> · TransactionRow.tsx</td><td>Lists and tables</td></tr>
    <tr><td>Chip / badge</td><td><code>.txn-chip</code>, <code>.badge</code></td><td>Tokens / labels</td></tr>
    <tr><td>Notice / banner</td><td><code>.notice-box</code>, <code>.alert</code></td><td>Alerts (non-modal guidance)</td></tr>
    <tr><td>Sheet</td><td><code>.sheet</code> · Modal.tsx, ActionMenu.tsx</td><td>Sheets</td></tr>
    <tr><td>Sidebar / drawer</td><td><code>.app-rail</code> · AppLayout.tsx</td><td>Sidebars, tab bars</td></tr>
    <tr><td>Back / icon buttons</td><td><code>.back-button</code>, <code>.icon-button</code></td><td>Toolbars</td></tr>
  </tbody></table>
</section>

<section>
  <p class="kicker">10</p>
  <h2 class="doc">Accessibility</h2>
  <div class="grid-2">
    <div class="principle"><b>Contrast</b><p>All text pairs measured in section 04 pass 4.5:1 in light and dark. Secondary text uses Apple's accessible gray, and colored text uses the increased-contrast twins.</p></div>
    <div class="principle"><b>Increase Contrast</b><p><code>prefers-contrast: more</code> switches separators to opaque, darkens secondary labels, deepens the navy tint (<code>#142A66</code>, or <code>#B4C6FF</code> text in dark mode) and makes glass nearly solid.</p></div>
    <div class="principle"><b>Reduce Transparency</b><p><code>prefers-reduced-transparency</code> replaces every glass and material surface with the solid elevated background.</p></div>
    <div class="principle"><b>Reduce Motion</b><p>All transitions and animations become instant. No information is conveyed by motion alone.</p></div>
    <div class="principle"><b>Targets &amp; input</b><p>44pt minimum on touch. Every control is a real button or input with a visible 2px tint focus ring. Custom selects use the select-only combobox pattern with full keyboard support.</p></div>
    <div class="principle"><b>Not color alone</b><p>Amounts carry a sign, uncategorized chips are outlined (not just gray), selected states add a ring or checkmark, and destructive actions say what they'll do.</p></div>
  </div>
</section>

<section>
  <p class="kicker">11</p>
  <h2 class="doc">Applied to Frugal AI</h2>
  <figure><img class="shot" src="img/transactions-light.jpg"><figcaption>Transaction: glass sidebar with tint selection, Large Title, capsule actions, account cards, grouped summary card, tinted notice, gray filter chips and capsule search, inset grouped list with tabular amounts.</figcaption></figure>
  <figure><img class="shot" src="img/transactions-dark.jpg"><figcaption>The same screen in dark mode: true-black page, #1C1C1E sections, the navy lifted to a mid navy for buttons and periwinkle for tinted text.</figcaption></figure>
</section>

<section>
  <div class="grid-2">
    <figure><img class="shot" src="img/home-light.jpg"><figcaption>Home: net-worth hero in Large Title with tabular figures, grouped account sections with Footnote headers, chart card.</figcaption></figure>
    <figure><img class="shot" src="img/settings-light.jpg"><figcaption>Settings: grouped form cards, filled fields, a primary "Add Category" capsule, tint and destructive icon buttons.</figcaption></figure>
  </div>
  <div style="display:flex;gap:1.2rem;align-items:flex-start">
    <figure style="flex:0 0 auto"><img class="shot-phone" src="img/transactions-phone.jpg"><figcaption>Phone (375pt): glass menu button,<br>wrapping chips, 44pt targets.</figcaption></figure>
    <div style="flex:1">
      <h3 class="doc" style="margin-top:.4rem">What changed, screen by screen</h3>
      <table class="spec"><tbody>
        <tr><td><b>Shell</b></td><td>Opaque bordered rail → floating glass sidebar. Phone drawer is a glass panel on a spring. Back and menu buttons are glass circles.</td></tr>
        <tr><td><b>Lists</b></td><td>Per-row tiles → one inset grouped list with hairlines. Monospace dates and amounts → tabular Inter.</td></tr>
        <tr><td><b>Controls</b></td><td>8px bordered buttons → capsules in four Apple styles. Bordered fields → filled 44px fields. Square checkboxes → round checkmarks.</td></tr>
        <tr><td><b>Overlays</b></td><td>Bordered modals → 34pt sheets with a scrim and a close circle. Opaque menus → glass popovers.</td></tr>
        <tr><td><b>Color</b></td><td>Acid-lime accent on violet-black → Frugal AI Navy on Apple grouped backgrounds. Coral expenses and green balances → plain positive amounts, red only for negatives.</td></tr>
        <tr><td><b>Cards</b></td><td>Bright UI colours (indigo, violet, teal…) → bank-card finishes (black, navy, maroon, forest…) with a sheen and an EMV chip.</td></tr>
        <tr><td><b>Type</b></td><td>Bricolage Grotesque + Inter at mixed sizes → Figtree + Inter on Apple's Dynamic Type scale.</td></tr>
      </tbody></table>
    </div>
  </div>
</section>

<section>
  <p class="kicker">12</p>
  <h2 class="doc">Implementation &amp; governance</h2>
  <h3 class="doc">Where it lives</h3>
  <table class="spec"><tbody>
    <tr><td><code>apps/web/src/index.css</code></td><td>Token layer (primitives → semantic → aliases), dark / increased-contrast / reduced-transparency overrides, base type, form fields, checkbox.</td></tr>
    <tr><td><code>apps/web/src/styles/components.css</code></td><td>Every component, in sections. Values reference tokens only.</td></tr>
    <tr><td><code>apps/web/index.html</code></td><td>Figtree + Inter (Google Fonts), light and dark <code>theme-color</code>.</td></tr>
    <tr><td><code>Modal.tsx</code>, <code>Button.tsx</code></td><td>Sheet classes instead of inline styles; the new <code>tinted</code> button variant.</td></tr>
    <tr><td><code>docs/design-system/</code></td><td>This document (<code>build.py</code> → HTML → PDF) and the product screenshots.</td></tr>
  </tbody></table>
  <h3 class="doc">Rules for contributors</h3>
  <ul>
    <li><b>Reference tokens, never values.</b> New colors go into the semantic tier with light and dark (and increased-contrast) values first.</li>
    <li><b>Use the alias for its meaning:</b> <code>--accent</code> for fills, <code>--accent-text</code> for text and icons, <code>--text-muted</code> for secondary text, <code>--separator</code> for hairlines.</li>
    <li><b>One filled button per view.</b> Destructive is never primary. Confirm only irreversible actions.</li>
    <li><b>Glass only for floating controls.</b> Content stays on solid surfaces.</li>
    <li><b>Native form controls are not allowed.</b> Use <code>FieldSelect</code>, <code>FieldDatePicker</code> and <code>SuggestInput</code> in forms, and <code>SelectDropdown</code>, <code>MultiSelectDropdown</code> and <code>DatePickerDropdown</code> in filter bars.</li>
    <li><b>Check both appearances</b> and the three accessibility settings before merging. Rebuild this document when tokens change.</li>
  </ul>
  <h3 class="doc">Known follow-ups</h3>
  <ul>
    <li>The card "custom colour" swatch still opens the OS color wheel; a system color picker would complete the controls.</li>
    <li>Inline styles in feature screens use tokens but could move into named classes over time.</li>
    <li>Apple's SF Symbols can't ship on the web; the stroke icon set approximates their weight and should keep matching text weight.</li>
  </ul>
  <p class="footer-note" style="margin-top:1.5rem">Frugal AI Design System v1.0 · Built on Apple's iOS 26 Human Interface Guidelines, UIKit and the iOS &amp; iPadOS 26 Figma kit. Apple, SF Pro, Liquid Glass and Wealthsimple are trademarks of their owners; Frugal AI uses openly licensed fonts (Figtree, Inter: SIL OFL).</p>
</section>

</body></html>'''

OUT_HTML.write_text(PAGE)
print('wrote', OUT_HTML.relative_to(ROOT))

if '--html' not in sys.argv:
    subprocess.run([
        CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=15000', '--allow-file-access-from-files',
        f'--print-to-pdf={OUT_PDF}', OUT_HTML.as_uri(),
    ], check=True, capture_output=True)
    print('wrote', OUT_PDF.relative_to(ROOT))
