"use client";

/**
 * The description editor.
 *
 * The storefront renders `description` as HTML through DOMPurify, so what this
 * produces is HTML - not markdown, and not plain text with newlines that the
 * product page would collapse.
 *
 * The toolbar is deliberately product-focused. It allows headings, emphasis,
 * lists, links and a small font-size scale, while still avoiding open-ended
 * colour/style controls that would fight the storefront's own typography.
 *
 * `immediatelyRender: false` is required under the App Router - TipTap warns
 * loudly otherwise, because rendering on the server and then hydrating gives a
 * mismatch it cannot reconcile.
 */

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import type { LucideIcon } from "lucide-react";
import {
  Bold,
  Code2,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";

const FONT_SIZES = [
  { value: "", label: "Auto size" },
  { value: "0.875rem", label: "Small" },
  { value: "1rem", label: "Base" },
  { value: "1.125rem", label: "Large" },
  { value: "1.25rem", label: "XL" },
  { value: "1.5rem", label: "2XL" },
  { value: "1.875rem", label: "3XL" },
] as const;

const ALLOWED_FONT_SIZES: ReadonlySet<string> = new Set(
  FONT_SIZES.map((size) => size.value).filter(Boolean),
);

const FontSize = Mark.create({
  name: "fontSize",
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => {
          const size = element.style.fontSize;
          return ALLOWED_FONT_SIZES.has(size) ? size : null;
        },
        renderHTML: (attributes) =>
          attributes.size && ALLOWED_FONT_SIZES.has(attributes.size)
            ? { style: `font-size: ${attributes.size}` }
            : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[style]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

export function RichTextEditor({
  value,
  onChange,
  invalid,
  placeholder = "Describe the product…",
}: {
  value: string;
  onChange: (html: string) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      Underline,
      FontSize,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "rich-text min-h-56 max-w-none px-3 py-2.5 focus:outline-none",
        ),
        "aria-label": "Product description",
      },
    },
    onUpdate: ({ editor: instance }) => {
      // TipTap represents "empty" as `<p></p>`, which is not empty to a
      // `min(1)` string check - so an untouched editor reports as blank and
      // the required-field message actually fires.
      const html = instance.getHTML();
      onChange(instance.isEmpty ? "" : html);
    },
  });

  /*
   * Pull an externally changed value back in - loading a product into the
   * editor, or a panel remounting after a save. Guarded on inequality, because
   * `setContent` moves the cursor and doing it on every keystroke would make
   * typing impossible.
   */
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="min-h-72 animate-pulse rounded-lg border bg-muted/30" />
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border transition-colors focus-within:border-ring",
        invalid && "border-destructive",
      )}
    >
      <Toolbar editor={editor} />

      {editor.isEmpty ? (
        <p className="pointer-events-none absolute px-3 py-2.5 text-sm text-muted-foreground">
          {placeholder}
        </p>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  );
}

/** A discriminated union, so a separator is not expected to carry an icon. */
type ToolbarEntry =
  | { separator: true }
  | {
      separator?: false;
      icon: LucideIcon;
      label: string;
      isActive: () => boolean;
      run: () => void;
    };

function Toolbar({ editor }: { editor: Editor }) {
  const buttons: ToolbarEntry[] = [
    { icon: Bold, label: "Bold", isActive: () => editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { icon: Italic, label: "Italic", isActive: () => editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { icon: UnderlineIcon, label: "Underline", isActive: () => editor.isActive("underline"), run: () => editor.chain().focus().toggleUnderline().run() },
    { icon: Strikethrough, label: "Strikethrough", isActive: () => editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run() },
    { icon: Code2, label: "Inline code", isActive: () => editor.isActive("code"), run: () => editor.chain().focus().toggleCode().run() },
    { separator: true },
    { icon: Pilcrow, label: "Paragraph", isActive: () => editor.isActive("paragraph"), run: () => editor.chain().focus().setParagraph().run() },
    { icon: Heading1, label: "Heading 1", isActive: () => editor.isActive("heading", { level: 1 }), run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { icon: Heading2, label: "Heading", isActive: () => editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: Heading3, label: "Subheading", isActive: () => editor.isActive("heading", { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { icon: Heading4, label: "Heading 4", isActive: () => editor.isActive("heading", { level: 4 }), run: () => editor.chain().focus().toggleHeading({ level: 4 }).run() },
    { separator: true },
    { icon: List, label: "Bullet list", isActive: () => editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { icon: ListOrdered, label: "Numbered list", isActive: () => editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { icon: Quote, label: "Quote", isActive: () => editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
    { icon: Minus, label: "Divider", isActive: () => false, run: () => editor.chain().focus().setHorizontalRule().run() },
    { separator: true },
    { icon: Link2, label: "Link", isActive: () => editor.isActive("link"), run: () => promptLink(editor) },
    { icon: Eraser, label: "Clear formatting", isActive: () => false, run: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
    { separator: true },
    { icon: Undo2, label: "Undo", isActive: () => false, run: () => editor.chain().focus().undo().run() },
    { icon: Redo2, label: "Redo", isActive: () => false, run: () => editor.chain().focus().redo().run() },
  ];

  return (
    // Scrolls rather than wrapping: three rows of icons on a phone would push
    // the writing area itself off the screen.
    <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-muted/30 px-1.5 py-1 scrollbar-none">
      <label className="sr-only" htmlFor="product-description-font-size">
        Font size
      </label>
      <select
        id="product-description-font-size"
        value={(editor.getAttributes("fontSize").size as string | undefined) ?? ""}
        title="Font size"
        aria-label="Font size"
        onChange={(event) => setFontSize(editor, event.target.value)}
        className="h-8 shrink-0 cursor-pointer rounded-md border bg-background px-2 text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:border-ring"
      >
        {FONT_SIZES.map((size) => (
          <option key={size.value || "auto"} value={size.value}>
            {size.label}
          </option>
        ))}
      </select>
      <span className="mx-1 h-5 w-px shrink-0 bg-border" />
      {buttons.map((button, index) =>
        button.separator ? (
          <span key={index} className="mx-1 h-5 w-px shrink-0 bg-border" />
        ) : (
          <button
            key={index}
            type="button"
            aria-label={button.label}
            aria-pressed={button.isActive()}
            title={button.label}
            // `onMouseDown` with preventDefault, so clicking a control does
            // not blur the editor and lose the selection it applies to.
            onMouseDown={(event) => event.preventDefault()}
            onClick={button.run}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent",
              button.isActive() && "bg-accent text-brand-foreground dark:text-brand",
            )}
          >
            <button.icon className="size-4" aria-hidden />
          </button>
        ),
      )}
    </div>
  );
}

function setFontSize(editor: Editor, size: string) {
  if (!size) {
    editor.chain().focus().unsetMark("fontSize").run();
    return;
  }

  editor.chain().focus().setMark("fontSize", { size }).run();
}

function promptLink(editor: Editor) {
  const existing = editor.getAttributes("link").href as string | undefined;
  const href = window.prompt("Link URL", existing ?? "https://");

  // Cancel leaves it alone; clearing the box removes the link.
  if (href === null) return;
  if (href === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }

  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}
