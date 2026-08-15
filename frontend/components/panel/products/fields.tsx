"use client";

/**
 * The inputs the product form is built from.
 *
 * Shared between the create screen and the edit panels so the two cannot
 * disagree about what a valid category selection or image looks like.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { ImageOff, Loader2, Plus, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminImage, TaxonomyRef } from "@/lib/api/admin/products";
import { checkImage, IMAGE_ACCEPT, mediaApi } from "@/lib/api/media";
import { errorMessage } from "@/lib/auth/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectValue } from "@/components/ui/select";

export const PANEL_CONTROL = "h-11 rounded-lg text-sm";

/** A titled block with its own save button - one panel, one endpoint. */
export function PanelCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>

      {footer ? (
        <footer className="flex items-center justify-end gap-2 border-t px-4 py-3 sm:px-5">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

/* ------------------------------- categories ------------------------------- */

/**
 * Multi-select as a list of checkboxes rather than a combobox.
 *
 * The API takes one to twenty category ids and a product routinely sits in two
 * or three. A combobox hides what is already chosen behind a click; a scrolling
 * checkbox list shows the whole answer at once, which is what matters when the
 * question is "is this in the right places".
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  invalid,
}: {
  categories: TaxonomyRef[];
  value: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
}) {
  if (categories.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
        No categories yet. Create one before adding products.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "max-h-52 overflow-y-auto rounded-lg border p-1",
        invalid && "border-destructive",
      )}
    >
      {categories.map((category) => {
        const checked = value.includes(category.id);
        const id = `category-${category.id}`;

        return (
          <label
            key={category.id}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={() =>
                onChange(
                  checked
                    ? value.filter((item) => item !== category.id)
                    : [...value, category.id],
                )
              }
            />
            <span className="min-w-0 flex-1 truncate">{category.name}</span>
          </label>
        );
      })}
    </div>
  );
}

/* ---------------------------------- tags ---------------------------------- */

export function TagsInput({
  value,
  onChange,
  placeholder = "e.g. sportswear — then press Enter",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const tag = draft.trim();
    // Silently ignoring a duplicate is right here - the shape of the list is
    // the answer, and an error for "you already have that" is noise.
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add();
          }
          // Backspace on an empty box removes the last tag, which is what
          // every tag input people have used already does.
          if (event.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        className={PANEL_CONTROL}
      />

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 font-normal">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => onChange(value.filter((item) => item !== tag))}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- images --------------------------------- */

/**
 * One image: upload a file, or paste a URL.
 *
 * Both exist because both are real. `POST /media/upload` stores a file and
 * hands back a Cloudinary URL, which is what most products need; a URL box
 * still matters for an asset that already lives somewhere.
 */
export function ImageField({
  value,
  onChange,
  onRemove,
  label,
}: {
  value: AdminImage | null;
  onChange: (image: AdminImage) => void;
  onRemove?: () => void;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const rejected = checkImage(file);
    if (rejected) {
      setError(rejected);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const { data } = await mediaApi.upload(file, "product");
      onChange({ src: data.media.url, alt: value?.alt ?? "" });
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
          {value?.src ? (
            <Image
              src={value.src}
              alt=""
              fill
              sizes="80px"
              className="object-contain p-1"
              // A pasted URL can point anywhere, and a broken remote image
              // should not take the optimizer down with it.
              unoptimized
            />
          ) : (
            <span className="flex h-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-5" aria-hidden />
            </span>
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            value={value?.src ?? ""}
            placeholder="e.g. https://cdn.example.com/shirt.webp"
            aria-label={`${label} image URL`}
            onChange={(event) =>
              onChange({ src: event.target.value, alt: value?.alt ?? "" })
            }
            className={PANEL_CONTROL}
          />
          <Input
            value={value?.alt ?? ""}
            placeholder="e.g. Black t-shirt, front view"
            aria-label={`${label} alt text`}
            onChange={(event) =>
              onChange({ src: value?.src ?? "", alt: event.target.value })
            }
            className={PANEL_CONTROL}
          />

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="h-9 cursor-pointer gap-1.5 rounded-lg px-3 text-xs font-medium"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-3.5" aria-hidden />
              )}
              {busy ? "Uploading…" : "Upload"}
            </Button>

            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onRemove}
                className="h-9 cursor-pointer rounded-lg px-3 text-xs font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Remove
              </Button>
            ) : null}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so the same file can be chosen again after a failure.
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The gallery: any number of images, each the same control as above. */
export function ImageListField({
  value,
  onChange,
}: {
  value: AdminImage[];
  onChange: (next: AdminImage[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {value.map((image, index) => (
        <ImageField
          key={index}
          label={`Image ${index + 1}`}
          value={image}
          onChange={(next) =>
            onChange(value.map((item, at) => (at === index ? next : item)))
          }
          onRemove={() => onChange(value.filter((_, at) => at !== index))}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...value, { src: "", alt: "" }])}
        className="h-10 cursor-pointer gap-1.5 self-start rounded-lg px-4 text-sm font-medium"
      >
        <Plus className="size-4" aria-hidden />
        Add image
      </Button>
    </div>
  );
}

/* --------------------------------- selects -------------------------------- */

/**
 * The label for a select's current value.
 *
 * Base UI's `Select.Value` prints the stored value when it has no children, so
 * a bare `<SelectValue />` shows `ACTIVE`, `__all__`, or a raw Mongo id rather
 * than the words in the list below it. Every select in the panel goes through
 * this so none of them can regress to that.
 */
export function SelectLabelFor({
  options,
  fallback = "",
}: {
  options: Record<string, string>;
  fallback?: string;
}) {
  return (
    <SelectValue>
      {(value) =>
        options[String(value ?? "")] ?? (fallback || String(value ?? ""))
      }
    </SelectValue>
  );
}

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  OUT_OF_STOCK: "Out of stock",
};

export const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: "Public",
  HIDDEN: "Hidden",
};

export const STOCK_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "In stock",
  OUT_OF_STOCK: "Out of stock",
  BACKORDER: "Backorder",
};

/** Brand and category selects key on an id, so their table is built per render. */
export function labelsFrom(
  items: TaxonomyRef[],
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    ...extra,
    ...Object.fromEntries(items.map((item) => [item.id, item.name])),
  };
}
