"use client";

/**
 * The description editor.
 *
 * The storefront renders `description` as HTML through DOMPurify, so what this
 * produces is HTML - not markdown, and not plain text with newlines that the
 * product page would collapse.
 *
 * The toolbar is deliberately short. A product description needs headings,
 * emphasis, lists and links; colour pickers and font sizes would let staff
 * produce markup that fights the storefront's own typography, which the
 * `.rich-text` styles there are meant to own.
 *
 * `immediatelyRender: false` is required under the App Router - TipTap warns
 * loudly otherwise, because rendering on the server and then hydrating gives a
 * mismatch it cannot reconcile.
 */

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { LucideIcon } from "lucide-react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";

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
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    { icon: Strikethrough, label: "Strikethrough", isActive: () => editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run() },
    { separator: true },
    { icon: Heading2, label: "Heading", isActive: () => editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: Heading3, label: "Subheading", isActive: () => editor.isActive("heading", { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { separator: true },
    { icon: List, label: "Bullet list", isActive: () => editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { icon: ListOrdered, label: "Numbered list", isActive: () => editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { icon: Quote, label: "Quote", isActive: () => editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
    { separator: true },
    { icon: Link2, label: "Link", isActive: () => editor.isActive("link"), run: () => promptLink(editor) },
    { separator: true },
    { icon: Undo2, label: "Undo", isActive: () => false, run: () => editor.chain().focus().undo().run() },
    { icon: Redo2, label: "Redo", isActive: () => false, run: () => editor.chain().focus().redo().run() },
  ];

  return (
    // Scrolls rather than wrapping: three rows of icons on a phone would push
    // the writing area itself off the screen.
    <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-muted/30 px-1.5 py-1 scrollbar-none">
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
