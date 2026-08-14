import DOMPurify from "isomorphic-dompurify";

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
 * `style`.
 *
 * A server component, so DOMPurify and its DOM shim stay out of the client
 * bundle entirely - the browser receives already-clean markup.
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

const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt", "title", "width", "height", "colspan", "rowspan"];

export function RichText({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // `javascript:` and `data:` hrefs are not links, whatever the tag says.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    // Strips the tag but keeps its text, so removing a `<script>` wrapper does
    // not silently delete a paragraph with it.
    KEEP_CONTENT: true,
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
