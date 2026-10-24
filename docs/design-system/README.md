# Frugal AI Design System

Frugal AI's (formerly FinAI) look and feel is built on Apple's iOS 26 Human Interface Guidelines, UIKit's semantic colors and the "iOS and iPadOS 26" Figma kit, with Wealthsimple-style typography.

**The full illustrated reference is [Frugal-AI-Design-System.pdf](Frugal-AI-Design-System.pdf).** It covers the research, decisions, tokens, components, accessibility and screenshots. Its swatches and component examples are rendered by the app's real CSS. Rebuild it after changing tokens or components:

```bash
python3 docs/design-system/build.py          # HTML + PDF (needs Google Chrome)
python3 docs/design-system/build.py --html   # HTML only
```

## Where it lives

| File | What |
| --- | --- |
| `apps/web/src/index.css` | Token layer, plus the overrides for dark mode, Increase Contrast and Reduce Transparency. Also base type, form fields and checkbox styles. |
| `apps/web/src/styles/components.css` | Every component, in sections. Values reference tokens only. |
| `apps/web/index.html` | Figtree and Inter fonts (Google Fonts), and light and dark `theme-color`. |

## Tokens in one minute

The tokens come in three tiers. Each tier only references the one below it.

1. **Primitives:** Apple's system colors (`--sys-green`, …), their increased-contrast twins (`--sys-green-ic`, …), the grays, and the Frugal AI Navy brand set (`--brand-navy`, with dark-mode and increased-contrast variants).
2. **Semantic:** what a value means.
   - Backgrounds: `--bg-grouped`, `--bg-grouped-secondary`, `--bg-elevated`
   - Labels: `--label-primary` … `--label-quaternary`
   - Fills and separators: `--fill-*`, `--separator`, `--separator-opaque`
   - Tint: `--tint-fill` (button fills), `--tint-text` (text and icons), `--tint-soft`
   - Status and materials: `--status-*`, `--glass-*`
   - Type styles: `--type-large-title` … `--type-caption-2`
   - Shape, space and motion: radii, spacing, `--spring`
3. **App aliases:** the short names components use (`--bg`, `--surface`, `--surface-raised`, `--text`, `--text-muted`, `--border`, `--accent`, `--accent-text`, `--danger`, `--success`, `--outflow`).

## Rules

- **Reference tokens, never raw values.** A new color goes into the semantic tier first, with light, dark and increased-contrast values.
- **The accent is Frugal AI Navy (`#1E3A8A`).** Use `--accent` for fills and `--accent-text` for text and icons; dark mode lifts them to `#3256C8` and `#8FA8FF`. Use `--text-muted` for secondary text and `--separator` for hairlines.
- **One filled (`.btn-primary`) button per view.** Destructive actions use `.btn-danger` and are never the primary button.
- **Liquid Glass (`--glass-*`) is only for floating controls:** the sidebar, drawer, back button, menus and popovers. Content stays on solid surfaces.
- **Money is neutral; red flags negatives.** Positive amounts and balances use the label color (`--amount-positive`), and only negative amounts are red (`--outflow`). Green (`--success`) is for success messages only.
- **No native form controls.**
  - In forms, use `FieldSelect`, `FieldDatePicker` and `SuggestInput`.
  - In filter bars, use `SelectDropdown`, `MultiSelectDropdown` and `DatePickerDropdown`.
- **Before merging,** check light mode, dark mode, Increase Contrast, Reduce Transparency and Reduce Motion.
