import sanitizeHtml from "sanitize-html";

import { cn } from "@/lib/utils";

/**
 * Renders admin-authored HTML.
 *
 * Sanitised, not trusted. The description is stored HTML that reaches the page
 * through an API, and `dangerouslySetInnerHTML` will happily run an `onerror`
 * on a broken `<img>` - so anyone who can edit a product, or anything that can
 * write to that field, would otherwise have script execution on every visitor
 * of that page. The allow-list below is what a product description legitimately
 * needs and nothing more: no `<script>`, no `<iframe>`, no event handlers, no
 * arbitrary `style`. A narrow `font-size` style is allowed because the product
 * editor exposes a fixed size scale; everything else is stripped.
 *
 * A server component, so the sanitiser stays out of the client bundle entirely
 * - the browser receives already-clean markup.
 *
 * `sanitize-html` and not `isomorphic-dompurify`: the latter pulls in jsdom,
 * which is a browser in a box - 770 files and ~11.5MB traced into whatever
 * route imports it. That weight is what left this route without a serverless
 * function on Vercel while every other route deployed fine, so the page 500'd
 * in production and worked everywhere else. This parses with htmlparser2
 * instead, needs no DOM, and sanitises by the same allow-list.
 */

const ALLOWED_TAGS = [
  "p", "br", "hr", "span", "div",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "mark", "small", "sub", "sup",
  "ul", "ol", "li",
  "blockquote", "code", "pre",
  "a", "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
];

const ALLOWED_ATTR = [
  "href",
  "target",
  "rel",
  "src",
  "alt",
  "title",
  "width",
  "height",
  "colspan",
  "rowspan",
  "style",
];

const ALLOWED_FONT_SIZE = /^(0\.875rem|1rem|1\.125rem|1\.25rem|1\.5rem|1\.875rem)$/;

export function RichText({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // The allow-list is the same for every tag, so no tag can carry an
    // attribute another one is denied.
    allowedAttributes: { "*": ALLOWED_ATTR },
    allowedStyles: { "*": { "font-size": [ALLOWED_FONT_SIZE] } },
    // `javascript:` and `data:` hrefs are not links, whatever the tag says.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {},
    allowedSchemesAppliedToAttributes: ["href", "src"],
    // `//evil.com` inherits the page's scheme and reads as a relative path at a
    // glance; a product description has no reason to use one.
    allowProtocolRelative: false,
    // A disallowed tag is unwrapped rather than deleted, so removing a
    // `<section>` wrapper does not silently delete the paragraph inside it -
    // except for `<script>`/`<style>`, where the content *is* the payload and
    // goes with the tag (`nonTextTags`).
    disallowedTagsMode: "discard",
  });

  if (!clean.trim()) return null;

  return (
    <div
      className={cn("rich-text", className)}
      // Safe: `clean` is the sanitiser's output, never the raw input.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
