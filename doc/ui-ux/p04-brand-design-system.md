# P04 — Brand design system

14/10/2026. WBS-N14 foundation, Phạm Thành Chung (Chunggrizzy11), agent-assisted. Reviewer Đoàn Tiến Đạt; final merger Nguyễn Ngọc Thành. UI PROVISIONAL: no Figma frame was supplied or inspected. Local brand contract and existing public resources are authoritative for logo/font/icon; legacy token observations are fallback, not a current Figma specification.

## Tokens and source

[CSS tokens](../../frontend/src/styles/tokens.css) are the source of truth. Primary text #3F2A6B, hero lavender #B79CE8, CTA #FFCB2E and cream #FFFBEF come from the brand contract/legacy tailwind config read without changing it. Surface white, muted text #63557B, control border #786889, error #A52232, success #216443 and warning #705100 are provisional semantic choices with calculated contrast. State text and explicit labels accompany color; lavender/yellow alone must not carry meaning. Use yellow with dark text, not white text. Inactive controls remain readable.

| Group | Usage |
| --- | --- |
| ink, ink-muted, cream, surface, lavender, lavender-soft, sun/sun-hover | Body, panels, headings, primary/secondary actions |
| error/error-surface, success/success-surface, warning/warning-surface | Errors/forbidden, success, warning/pending |
| border, disabled-ink/disabled-surface, focus | Controls, inactive states and 3px focus outline with 3px offset |
| font-body/font-display; text-small/body/large/heading | Nunito; Crayon only display headings; 14/16/20px and responsive 28–40px heading |
| space-1/2/3/4/6/8 | 4/8/12/16/24/32px at default root size |
| radius-control/panel, target/icon/content-width/dialog-width | 12/20px, >=44px controls,20px icons,72rem content,32rem modal |
| z-base/dropdown/sticky | 0/10/20; native modal top layer sits above page stacking |

Sizes use rem and wrapping, not fixed-width text. Focus ring must remain visible; do not remove it or clip it with overflow. Light mode only: no approved dark palette exists. No animation was introduced; no motion dependency/reduced-motion simulation is needed. System forced-colors retain native colors and visible borders. .pwc-numeric uses tabular figures for domain consumers.

## Fonts and brand resources

[Font inventory](p04-font-inventory.json) is generated from actual sfnt OS/2 usWeightClass/fsSelection and fvar presence. All17 files are static. Crayon OTF400 Regular; Nunito TTF250 ExtraLight,300 Light,400 Regular/Italic,500 Medium,600 SemiBold,700 Bold,800 ExtraBold,900 Black with available italics. ExtraLight filename is not evidence of200; actual metadata250 is declared. No fake variable ranges. font-synthesis:none prevents fake bold/italic; keep Crayon at400 and use Nunito400/700 for normal form text. Fonts load from /fonts with font-display:swap, falling back to Nunito/system-ui/sans-serif.

BrandLogo selects current /assets/logo/ngang.svg or doc.svg with height:auto and max-width100%; no redraw/recolor. BrandIcon allowlist uses current arrow-right.svg/refresh.svg, viewBox0 0 11 11 and baked fill #292D32 preserved. These small icons are optional adjuncts to text, not substitutes for labels. Decorative icons use alt empty/aria-hidden; semantic icon uses label. Icon-only Button needs an explicit aria-label. No external icons, pet stock or Pinterest assets were added; public files stay unchanged.

## Consumer APIs

Import `{ Button, Input, Select, Dialog, Notice, BrandLogo, BrandIcon }` from frontend/src/components/ui/index.js. Load frontend/src/styles/index.css once. No package/lockfile or production route changes.

- Button: native button; type=button by default, opt into submit. variant primary/secondary/ghost/danger; loading disables activation and exposes aria-busy/loadingLabel. Callers own request state/idempotency; UI disabled is not authorization or a server race guard.
- Input: native input; label required, hint/error optional, supplied or generated stable id, external aria-describedby merged. Error sets aria-invalid and connected text. Native props such as type/name/required/readOnly/disabled/autoComplete/ref/onChange remain available. Never intercept paste. Error messages must be safe user-facing text; do not pass raw API stacks/PII. Caller owns validation timing and focus to first invalid field after form submit.
- Select: same field contract, native select/options/keyboard behavior. For required choice, supply empty value option and controlled/default value; do not make an unavailable option look successful.
- Dialog: controlled open/onClose(reason), title required, description optional, children/footer. Native showModal/close manages top layer, inert background and focus return. Browser-native Tab/Shift+Tab may visit browser chrome at boundaries; page background controls stay unavailable while modal. dismissible=false blocks Escape/close control only; caller must provide a recovery path. intent=destructive exposes alertdialog; irreversible actions require explicit domain confirmation in footer. No backdrop auto-dismiss. Use native autoFocus on a suitable child when necessary; never autofocus a destructive confirm. Supports browser versions with showModal; no silent non-modal fallback. Keep one active modal interaction surface at a time.
- Notice: state info/success/warning/error/loading/empty/forbidden/pending; title and body are text, action optional. Error/forbidden use alert, others status. Use for state changes; empty should supply one useful action. Pending means no server acknowledgement. Component is presentation only, never marks a transaction saved/paid or grants access.
- BrandLogo: orientation horizontal/vertical, alt/className. BrandIcon: name arrowRight/refresh, optional label/className; unknown icon fails instead of guessing a path.

## Contrast and verification

[W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) was searched and fetched through Exa14/10. Local calculations use relative sRGB luminance and (lighter+.05)/(darker+.05), compare unrounded ratios; [18pair report](p04-contrast-report.json) records rounded display values. All text pairs >=4.5, selected border/focus pairs>=3. Example text: ink/cream11.566, ink/yellow7.883, error/white7.305, success/success-surface6.501, warning/warning-surface6.893. This is evidence for selected tokens, not full WCAG certification.

Run from frontend:

```bash
npm ci
npm test
npm run lint
npm run build
npm audit
npx --no-install vite build --config tests/manual/vite.config.js
npx --no-install vite --config tests/manual/vite.config.js --host 127.0.0.1 --port 5174 --strictPort
```

Actual results and browser limits: [P04 handoff](p04-handoff.md). Manual fixture runs in its own root and compiles into ignored dist/p04-manual; do not deploy it. It uses synthetic display states/no API. Production build still validates existing P03. Brand adoption in production root remains a P34 wiring gate; [proposed patch](p04-root-integration-proposal.patch) is reviewable against base798a795, not applied here. P34 should remove duplicate P03 font/global declarations when importing the P04 CSS entry, use shared components where appropriate, and rerun app tests/build/route/keyboard checks. Do not apply this patch blindly if those files have changed.
