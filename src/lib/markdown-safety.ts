const SAFE_DESTINATION = /^(?:https?:|mailto:|[/#])/iu;

/** The composer controls Markdown, but sponsor-facing text must never inject HTML. */
export function escapeHtmlInMarkdown(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

/**
 * Markdown link and image destinations are author-supplied and reach a preview
 * page served from our own origin, so only web schemes are allowed through.
 */
export function neutralizeUnsafeMarkdownDestinations(value: string): string {
  return value.replace(
    /(\]\(\s*)([^)\s]*)/gu,
    (match, open: string, destination: string) =>
      destination === "" || SAFE_DESTINATION.test(destination)
        ? match
        : `${open}#`,
  );
}
