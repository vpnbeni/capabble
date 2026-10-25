/** Web preview only: the page in a sandboxed iframe (no scripts); links open in a new tab. */
export function HtmlView({ html }: { html: string }) {
  return (
    <iframe
      title="Notice"
      srcDoc={html}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      style={{ flex: 1, width: '100%', height: '100%', border: 0 }}
    />
  )
}
