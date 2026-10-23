import type { Palette } from '@/theme/tokens'

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A complete HTML page for school-written content (a circular), styled with the design tokens.
 * Scripts never run: the viewers load it with JavaScript off (native) or in a sandbox (web).
 */
export const htmlDocument = ({ title, subtitle, body, colors }: { title: string; subtitle?: string; body: string; colors: Palette }) => `<!doctype html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; background: ${colors.bg}; color: ${colors.ink}; }
  body { font: 16px/24px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 16px 16px 48px; overflow-wrap: anywhere; }
  h1 { font-size: 18px; line-height: 26px; font-weight: 600; margin: 0 0 4px; }
  .sub { color: ${colors['ink-muted']}; font-size: 14px; line-height: 20px; margin: 0 0 16px; }
  .body { background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 12px; padding: 16px; }
  .body > :first-child { margin-top: 0; } .body > :last-child { margin-bottom: 0; }
  a { color: ${colors['accent-strong']}; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; font-size: 14px; line-height: 20px; }
  th, td { border: 1px solid ${colors.border}; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: ${colors['surface-sunken']}; font-weight: 600; }
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ''}
  <div class="body">${body}</div>
</body></html>`
