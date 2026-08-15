"use client";

/**
 * The product's images: drop files to upload, drag rows to reorder.
 *
 * Order is data here, not decoration - the gallery renders in array order, so
 * "which photo comes second" is something staff have to be able to say. That
 * is why this is a sortable list rather than a grid of uploads.
 *
 * `dnd-kit` rather than the HTML5 drag API: the native one does not fire on
 * touch at all, so a phone could reorder nothing. The pointer sensor here has
 * an activation distance so a tap still scrolls the page and only a deliberate
 * drag picks a row up.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ImageOff,
  Link as LinkIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminImage } from "@/lib/api/admin/products";
import { checkImage, IMAGE_ACCEPT, mediaApi } from "@/lib/api/media";
import { errorMessage } from "@/lib/auth/errors";
import { Input } from "@/components/ui/input";

/** A stable key per row. Array index would remount every row on reorder. */
interface Row extends AdminImage {
  uid: string;
}

let counter = 0;
const nextUid = () => `img-${(counter += 1)}`;

export function toRows(images: AdminImage[]): Row[] {
  return images.map((image) => ({ ...image, uid: nextUid() }));
}

/**
 * Strips the local row id, and nothing else.
 *
 * Blank rows are kept deliberately: "Add an image by URL" appends an empty one
 * for the URL to be typed into, and filtering here would drop it on the way
 * back through state so the row could never appear. Empties are removed where
 * it actually matters - `galleryToApi`, when the payload is built.
 */
export function fromRows(rows: Row[]): AdminImage[] {
  return rows.map(({ src, alt, id }) => ({ src, alt, ...(id ? { id } : {}) }));
}

export function ImageManager({
  rows,
  onChange,
}: {
  rows: Row[];
  onChange: (next: Row[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    // 6px before a drag starts, so tapping a row's input still works and a
    // scroll gesture is not mistaken for a reorder.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function uploadFiles(files: File[]) {
    const rejected = files.map(checkImage).find(Boolean);
    if (rejected) {
      setError(rejected);
      return;
    }

    setError(null);
    setUploading(files.length);

    try {
      // Sequential, not parallel: the API's write limiter counts requests, and
      // ten at once from one dropped folder is the way to meet a 429.
      const added: Row[] = [];
      for (const file of files) {
        const { data } = await mediaApi.upload(file, "product");
        added.push({ src: data.media.url, alt: "", uid: nextUid() });
        setUploading((count) => count - 1);
      }
      onChange([...rows, ...added]);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploading(0);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = rows.findIndex((row) => row.uid === active.id);
    const to = rows.findIndex((row) => row.uid === over.id);
    if (from < 0 || to < 0) return;

    onChange(arrayMove(rows, from, to));
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const files = [...event.dataTransfer.files].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length > 0) void uploadFiles(files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragOver
            ? "border-brand bg-brand/8"
            : "border-border hover:border-brand/50 hover:bg-muted/40",
        )}
      >
        {uploading > 0 ? (
          <>
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              Uploading {uploading} {uploading === 1 ? "image" : "images"}…
            </p>
          </>
        ) : (
          <>
            <Upload className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              Drop images here, or click to choose
            </p>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, GIF or AVIF · up to 3MB each
            </p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (files.length > 0) void uploadFiles(files);
          }}
        />
      </div>

      {/* Uploading is the common path, but an asset that already lives
          somewhere needs a way in that is not a round trip through the disk. */}
      <button
        type="button"
        onClick={() => onChange([...rows, { src: "", alt: "", uid: nextUid() }])}
        className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground"
      >
        <LinkIcon className="size-3.5" aria-hidden />
        Add an image by URL
      </button>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={rows.map((row) => row.uid)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {rows.map((row, index) => (
                <SortableRow
                  key={row.uid}
                  row={row}
                  index={index}
                  onChange={(next) =>
                    onChange(rows.map((item, at) => (at === index ? next : item)))
                  }
                  onRemove={() =>
                    onChange(rows.filter((_, at) => at !== index))
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}


    </div>
  );
}

/**
 * The single thumbnail: one drop target, one preview.
 *
 * Deliberately not an `ImageManager` of length one - there is no order to
 * express and nothing to drag, so a sortable list would be scaffolding around
 * a single value.
 */
export function ThumbnailField({
  value,
  onChange,
  invalid,
}: {
  value: AdminImage | null;
  onChange: (next: AdminImage | null) => void;
  invalid?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
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
      const { data } = await mediaApi.upload(file, "product-thumbnail");
      onChange({ src: data.media.url, alt: value?.alt ?? "" });
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = [...event.dataTransfer.files].find((entry) =>
            entry.type.startsWith("image/"),
          );
          if (file) void upload(file);
        }}
        className={cn(
          // Square, but only ~11rem of it. A full-column preview was larger
          // than the picture ever needs to be to check it is the right one.
          "relative flex aspect-square w-44 max-w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors",
          dragOver
            ? "border-brand bg-brand/8"
            : invalid
              ? "border-destructive"
              : "border-border hover:border-brand/50 hover:bg-muted/40",
        )}
      >
        {value?.src ? (
          <Image
            src={value.src}
            alt=""
            fill
            sizes="176px"
            className="object-contain p-2"
            unoptimized
          />
        ) : (
          <span className="flex flex-col items-center gap-1 px-3 text-center">
            {busy ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <Upload className="size-5 text-muted-foreground" aria-hidden />
            )}
            <span className="text-xs font-medium">
              {busy ? "Uploading…" : "Drop or click"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              up to 3MB
            </span>
          </span>
        )}

        {busy && value?.src ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-6 animate-spin" aria-hidden />
          </span>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="thumb-src" className="text-xs font-medium text-muted-foreground">
          Image URL
        </label>
        <Input
          id="thumb-src"
          value={value?.src ?? ""}
          placeholder="e.g. https://cdn.example.com/shirt.webp"
          onChange={(event) =>
            onChange(
              event.target.value
                ? { src: event.target.value, alt: value?.alt ?? "" }
                : null,
            )
          }
          className="h-10 rounded-md text-xs"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="thumb-alt" className="text-xs font-medium text-muted-foreground">
          Alt text
        </label>
        <Input
          id="thumb-alt"
          value={value?.alt ?? ""}
          placeholder="e.g. Black t-shirt, front view"
          onChange={(event) =>
            onChange({ src: value?.src ?? "", alt: event.target.value })
          }
          className="h-10 rounded-md text-xs"
        />
      </div>

      {value?.src ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="cursor-pointer self-start rounded-md px-1 text-xs font-medium text-destructive hover:underline"
        >
          Remove thumbnail
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SortableRow({
  row,
  index,
  onChange,
  onRemove,
}: {
  row: Row;
  index: number;
  onChange: (next: Row) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.uid });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-start gap-2 rounded-lg border bg-card p-2",
        isDragging && "z-10 opacity-80 shadow-card-hover",
      )}
    >
      <button
        type="button"
        aria-label={`Reorder image ${index + 1}`}
        // The handle, not the whole row: dragging from anywhere would make the
        // text inputs inside impossible to select.
        {...attributes}
        {...listeners}
        className="mt-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <span className="relative size-14 shrink-0 overflow-hidden rounded-md border bg-muted/30">
        {row.src ? (
          <Image
            src={row.src}
            alt=""
            fill
            sizes="56px"
            className="object-contain p-0.5"
            // A pasted URL can point anywhere; a broken host should not take
            // the image optimizer down with it.
            unoptimized
          />
        ) : (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-4" aria-hidden />
          </span>
        )}


      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${row.uid}-src`}
            className="text-xs font-medium text-muted-foreground"
          >
            Image URL
          </label>
          <Input
            id={`${row.uid}-src`}
            value={row.src}
            placeholder="e.g. https://cdn.example.com/shirt.webp"
            onChange={(event) => onChange({ ...row, src: event.target.value })}
            className="h-10 rounded-md text-xs"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${row.uid}-alt`}
            className="text-xs font-medium text-muted-foreground"
          >
            Alt text
          </label>
          <Input
            id={`${row.uid}-alt`}
            value={row.alt}
            placeholder="e.g. Black t-shirt, front view"
            onChange={(event) => onChange({ ...row, alt: event.target.value })}
            className="h-10 rounded-md text-xs"
          />
        </div>
      </div>

      <button
        type="button"
        aria-label={`Remove image ${index + 1}`}
        onClick={onRemove}
        className="mt-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}
