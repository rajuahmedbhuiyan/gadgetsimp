"use client";

/**
 * Variable products: the option axes, and the variants they produce.
 *
 * Two connected halves, in the order the decision is actually made. First the
 * axes - `color: [black, white]`, `size: [m, l]` - which is `variationOptions`
 * on the API. Then the combinations, which is `variations`.
 *
 * The matrix is generated rather than typed. Two axes of three values is nine
 * SKUs, and entering those by hand is where a catalogue picks up a variant
 * with the wrong option pair. Generating them means the axes are the single
 * source of truth and every row is guaranteed to be a real combination.
 *
 * Regenerating keeps what has already been filled in: prices and stock are
 * matched back by their option signature, so adding a colour does not wipe the
 * eight rows already priced.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ChevronDown,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { generateVariations } from "@/lib/api/admin/products";
import type {
  AdminImage,
  GeneratedVariation,
  ProductStatus,
  ProductStock,
  StockStatus,
} from "@/lib/api/admin/products";
import { formatFilterValue } from "@/lib/shop/labels";
import {
  deriveVariantSku,
  integerOnly,
  normaliseSku,
  numericOnly,
} from "@/lib/panel/product-form";
import { checkImage, IMAGE_ACCEPT, mediaApi } from "@/lib/api/media";
import { errorMessage } from "@/lib/auth/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";

export interface OptionAxis {
  key: string;
  values: string[];
}

/**
 * One variant, with every field the API's variation object takes.
 *
 * `options` is the only thing that cannot be edited: it is what identifies the
 * combination, and changing it would silently turn "black / M" into a
 * different SKU rather than editing this one. Everything else - price, stock,
 * status, picture - is the variant's own.
 */
export interface VariantRow {
  /** `color:black|size:m` - stable across regeneration. */
  signature: string;
  options: Record<string, string>;
  sortOrder: number;

  sku: string;
  sellingPrice: string;
  originalPrice: string;

  trackInventory: boolean;
  quantity: string;
  lowStockThreshold: string;
  allowBackorder: boolean;
  stockStatus: StockStatus;

  status: ProductStatus;
  /** Falls back to the product thumbnail when a variant has no shot of its own. */
  image: AdminImage | null;
}

export function signatureOf(options: Record<string, string>) {
  return Object.keys(options)
    .sort()
    .map((key) => `${key}:${options[key]}`)
    .join("|");
}

/** Every combination of every axis, in axis order. */
export function buildMatrix(axes: OptionAxis[]): Record<string, string>[] {
  const usable = axes.filter((axis) => axis.key && axis.values.length > 0);
  if (usable.length === 0) return [];

  return usable.reduce<Record<string, string>[]>(
    (rows, axis) =>
      rows.flatMap((row) =>
        axis.values.map((value) => ({ ...row, [axis.key]: value })),
      ),
    [{}],
  );
}

export function VariationsBuilder({
  axes,
  onAxesChange,
  variants,
  onVariantsChange,
  defaults,
  skuBase,
}: {
  axes: OptionAxis[];
  onAxesChange: (next: OptionAxis[]) => void;
  variants: VariantRow[];
  onVariantsChange: (next: VariantRow[]) => void;
  /**
   * What every generated row starts as. Sent to the API as the generate
   * body's defaults, and echoed back on each combination - so a matrix of
   * twenty arrives priced and stocked rather than as twenty empty rows.
   */
  defaults: {
    sellingPrice?: number;
    originalPrice?: number;
    stock?: ProductStock;
    status?: ProductStatus;
    image?: AdminImage;
  };
  /** The product SKU, or its slug/name - whatever variant SKUs hang off. */
  skuBase: string;
}) {
  const matrix = buildMatrix(axes);
  const signatures = new Set(matrix.map(signatureOf));
  const currentSignatures = new Set(variants.map((variant) => variant.signature));

  const missing = matrix.filter(
    (options) => !currentSignatures.has(signatureOf(options)),
  );
  const stale = variants.filter((variant) => !signatures.has(variant.signature));
  const outOfSync = missing.length > 0 || stale.length > 0;

  const [generating, setGenerating] = useState(false);

  /**
   * Expand the axes into rows, keeping anything already filled in.
   *
   * The combinations come from `POST /variations/generate` rather than being
   * worked out here, so the server's own limits apply - 1 to 500, unique
   * values per axis. It answers 403 to a moderator, though (the endpoint is
   * admin-only while the product routes are not), so a local cartesian
   * product stands in rather than blocking them from building the product.
   */
  async function regenerate() {
    const usable = axes.filter((axis) => axis.key.trim() && axis.values.length);
    if (usable.length === 0) return;

    setGenerating(true);
    let generated: GeneratedVariation[] = [];

    try {
      generated = await generateVariations({
        options: Object.fromEntries(usable.map((axis) => [axis.key, axis.values])),
        ...defaults,
      });
    } catch {
      // Same combinations, same defaults, worked out here - see the note on
      // `generateVariations` about the endpoint being admin-only.
      generated = buildMatrix(usable).map((options, sortOrder) => ({
        options,
        sortOrder,
        ...defaults,
      }));
      toast.message("Generated locally", {
        description:
          "The variations service was unavailable, so the combinations were worked out here.",
      });
    } finally {
      setGenerating(false);
    }

    const bySignature = new Map(variants.map((v) => [v.signature, v]));

    onVariantsChange(
      generated.map((entry, index) => {
        const signature = signatureOf(entry.options);
        const existing = bySignature.get(signature);
        // Anything already edited survives; only new rows take the defaults.
        if (existing) return existing;

        return {
          signature,
          options: entry.options,
          sortOrder: entry.sortOrder ?? index,
          /*
           * The server's SKU if it ever sends one, otherwise the same string
           * it would have generated. `POST /variations/generate` has a strict
           * body with no `sku` field today, so in practice this is always the
           * local derivation - which is why it mirrors the API's own rule
           * rather than inventing a format.
           */
          sku: entry.sku ?? deriveVariantSku(skuBase, entry.options),
          sellingPrice: entry.sellingPrice != null ? String(entry.sellingPrice) : "",
          originalPrice: entry.originalPrice != null ? String(entry.originalPrice) : "",
          trackInventory: entry.stock?.trackInventory ?? true,
          quantity: String(entry.stock?.quantity ?? 0),
          lowStockThreshold: String(entry.stock?.lowStockThreshold ?? 0),
          allowBackorder: entry.stock?.allowBackorder ?? false,
          stockStatus: entry.stock?.status ?? "IN_STOCK",
          status: entry.status ?? "ACTIVE",
          image: entry.image ?? null,
        };
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AxisEditor axes={axes} onChange={onAxesChange} />

      {matrix.length > 0 ? (
        <div className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium">
              {matrix.length} combination{matrix.length === 1 ? "" : "s"}
              {variants.length > 0 ? ` · ${variants.length} set up` : ""}
            </p>
            <Button
              type="button"
              variant={outOfSync ? "default" : "outline"}
              disabled={generating}
              onClick={() => void regenerate()}
              className="h-9 cursor-pointer gap-1.5 rounded-md px-3 text-xs font-medium"
            >
              <RefreshCw
                className={cn("size-3.5", generating && "animate-spin")}
                aria-hidden
              />
              {generating
                ? "Generating…"
                : variants.length === 0
                  ? "Generate variants"
                  : "Sync variants"}
            </Button>
          </div>

          {outOfSync ? (
            <p className="border-b bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              The axes above no longer match the rows below
              {missing.length > 0 ? ` — ${missing.length} to add` : ""}
              {stale.length > 0 ? ` — ${stale.length} no longer valid` : ""}.
              Syncing keeps everything you have already filled in.
            </p>
          ) : null}

          {variants.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No variants yet. Generate them from the axes above.
            </p>
          ) : (
            <VariantRows variants={variants} onChange={onVariantsChange} />
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          Add an option — colour, size — and its values to build variants.
        </p>
      )}
    </div>
  );
}

/* --------------------------------- axes ----------------------------------- */

function AxisEditor({
  axes,
  onChange,
}: {
  axes: OptionAxis[];
  onChange: (next: OptionAxis[]) => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const update = (index: number, next: OptionAxis) =>
    onChange(axes.map((axis, at) => (at === index ? next : axis)));

  const addValue = (index: number) => {
    const raw = (drafts[index] ?? "").trim().toLowerCase();
    if (!raw) return;

    const axis = axes[index]!;
    if (!axis.values.includes(raw)) {
      update(index, { ...axis, values: [...axis.values, raw] });
    }
    setDrafts((current) => ({ ...current, [index]: "" }));
  };

  return (
    <div className="flex flex-col gap-3">
      {axes.map((axis, index) => (
        <div key={index} className="rounded-lg border p-3">
          <label
            htmlFor={`axis-${index}`}
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Option key
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={`axis-${index}`}
              value={axis.key}
              placeholder="e.g. color"
              // Lowercased as typed: the API's key format is
              // `^[a-z][a-z0-9_]*$`, so `Color` would be rejected on save.
              onChange={(event) =>
                update(index, {
                  ...axis,
                  key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                })
              }
              className="h-10 flex-1 rounded-md font-mono text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove option"
              onClick={() => onChange(axes.filter((_, at) => at !== index))}
              className="size-9 shrink-0 cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {axis.values.map((value) => (
              <Badge key={value} variant="secondary" className="gap-1 font-normal">
                {formatFilterValue(value)}
                <button
                  type="button"
                  aria-label={`Remove ${value}`}
                  onClick={() =>
                    update(index, {
                      ...axis,
                      values: axis.values.filter((item) => item !== value),
                    })
                  }
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            ))}
          </div>

          <label
            htmlFor={`axis-${index}-value`}
            className="mt-3 mb-1 block text-xs font-medium text-muted-foreground"
          >
            Values
          </label>
          <Input
            id={`axis-${index}-value`}
            value={drafts[index] ?? ""}
            placeholder="e.g. black — then press Enter"
            aria-label={`Add a value for ${axis.key || "this option"}`}
            onChange={(event) =>
              setDrafts((current) => ({ ...current, [index]: event.target.value }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addValue(index);
              }
            }}
            onBlur={() => addValue(index)}
            className="h-10 rounded-md text-xs"
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...axes, { key: "", values: [] }])}
        className="h-9 cursor-pointer gap-1.5 self-start rounded-lg px-3 text-xs font-medium"
      >
        <Plus className="size-3.5" aria-hidden />
        Add option
      </Button>
    </div>
  );
}

/* -------------------------------- variants -------------------------------- */

function VariantRows({
  variants,
  onChange,
}: {
  variants: VariantRow[];
  onChange: (next: VariantRow[]) => void;
}) {
  // Which rows have their detail open. Collapsed by default: a matrix of
  // twenty with every field expanded is a page nobody can scan.
  const [open, setOpen] = useState<Set<string>>(new Set());

  const update = (index: number, next: VariantRow) =>
    onChange(variants.map((variant, at) => (at === index ? next : variant)));

  const toggle = (signature: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(signature)) next.delete(signature);
      else next.add(signature);
      return next;
    });

  return (
    // Cards rather than a table: a table wide enough for every field does not
    // survive a phone, and this is a screen used away from a desk.
    <ul className="divide-y">
      {variants.map((variant, index) => {
        const invalid =
          variant.originalPrice !== "" &&
          Number(variant.originalPrice) > 0 &&
          Number(variant.originalPrice) < Number(variant.sellingPrice);
        const expanded = open.has(variant.signature);

        return (
          <li key={variant.signature} className="flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2">
              {/* Its own picture, seeded from the product thumbnail by the
                  generate call. A colour variant showing the wrong colour on
                  the picker is the whole reason this exists. */}
              <VariantImage
                value={variant.image}
                onChange={(image) => update(index, { ...variant, image })}
                label={variant.signature}
              />

              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {/* The one thing that cannot change: these identify the row. */}
                {Object.entries(variant.options).map(([key, value]) => (
                  <Badge key={key} variant="outline" className="font-normal">
                    <span className="text-muted-foreground">{key}:</span>&nbsp;
                    {formatFilterValue(value)}
                  </Badge>
                ))}
                {variant.status !== "ACTIVE" ? (
                  <Badge className="bg-warning/15 font-normal text-warning-foreground dark:text-warning">
                    {variant.status === "DRAFT" ? "Draft" : "Out of stock"}
                  </Badge>
                ) : null}
              </div>

              <Button
                type="button"
                variant="ghost"
                onClick={() => toggle(variant.signature)}
                aria-expanded={expanded}
                className="h-9 shrink-0 cursor-pointer gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground"
              >
                {expanded ? "Less" : "More"}
                <ChevronDown
                  className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                  aria-hidden
                />
              </Button>
            </div>

            {/* A label on every row rather than headings above the first:
                once the list is long enough to scroll, a heading that has left
                the screen labels nothing. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Labelled label="SKU" id={`sku-${index}`}>
                <Input
                  id={`sku-${index}`}
                  value={variant.sku}
                  placeholder="e.g. NIKE-BLACK-M"
                  onChange={(event) =>
                    // Same house format as the product SKU, so a stock report
                    // does not mix `nike-black-m` with `NIKE-BLACK-M`.
                    update(index, { ...variant, sku: normaliseSku(event.target.value) })
                  }
                  className="h-10 rounded-md text-xs"
                />
              </Labelled>

              <Labelled label="Price" id={`price-${index}`}>
                <Input
                  id={`price-${index}`}
                  value={variant.sellingPrice}
                  inputMode="decimal"
                  placeholder="e.g. 1299"
                  onChange={(event) =>
                    update(index, {
                      ...variant,
                      sellingPrice: numericOnly(event.target.value),
                    })
                  }
                  className="h-10 rounded-md text-xs tabular-nums"
                />
              </Labelled>

              <Labelled label="Was price" id={`was-${index}`}>
                <Input
                  id={`was-${index}`}
                  value={variant.originalPrice}
                  inputMode="decimal"
                  placeholder="e.g. 1499"
                  onChange={(event) =>
                    update(index, {
                      ...variant,
                      originalPrice: numericOnly(event.target.value),
                    })
                  }
                  className={cn(
                    "h-10 rounded-md text-xs tabular-nums",
                    invalid && "border-destructive",
                  )}
                />
              </Labelled>

              <Labelled label="Quantity" id={`qty-${index}`}>
                <Input
                  id={`qty-${index}`}
                  value={variant.quantity}
                  inputMode="numeric"
                  placeholder="e.g. 8"
                  onChange={(event) =>
                    update(index, {
                      ...variant,
                      quantity: integerOnly(event.target.value),
                    })
                  }
                  className="h-10 rounded-md text-xs tabular-nums"
                />
              </Labelled>
            </div>

            {invalid ? (
              <p className="text-xs text-destructive">
                The was-price cannot be below this variant&apos;s price.
              </p>
            ) : null}

            {expanded ? (
              <div className="mt-1 flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Labelled label="Low stock at" id={`low-${index}`}>
                    <Input
                      id={`low-${index}`}
                      value={variant.lowStockThreshold}
                      inputMode="numeric"
                      placeholder="e.g. 2"
                      onChange={(event) =>
                        update(index, {
                          ...variant,
                          lowStockThreshold: integerOnly(event.target.value),
                        })
                      }
                      className="h-10 rounded-md text-xs tabular-nums"
                    />
                  </Labelled>

                  <Labelled label="Stock status" id={`stock-${index}`}>
                    <select
                      id={`stock-${index}`}
                      value={variant.stockStatus}
                      onChange={(event) =>
                        update(index, {
                          ...variant,
                          stockStatus: event.target.value as StockStatus,
                        })
                      }
                      className="h-10 w-full cursor-pointer rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:border-ring"
                    >
                      <option value="IN_STOCK">In stock</option>
                      <option value="OUT_OF_STOCK">Out of stock</option>
                      <option value="BACKORDER">Backorder</option>
                    </select>
                  </Labelled>

                  <Labelled label="Variant status" id={`status-${index}`}>
                    <select
                      id={`status-${index}`}
                      value={variant.status}
                      onChange={(event) =>
                        update(index, {
                          ...variant,
                          status: event.target.value as ProductStatus,
                        })
                      }
                      className="h-10 w-full cursor-pointer rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:border-ring"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="DRAFT">Draft</option>
                      <option value="OUT_OF_STOCK">Out of stock</option>
                    </select>
                  </Labelled>
                </div>

                <div className="flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                    <Checkbox
                      checked={variant.trackInventory}
                      onCheckedChange={(checked) =>
                        update(index, { ...variant, trackInventory: checked === true })
                      }
                    />
                    Track inventory
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                    <Checkbox
                      checked={variant.allowBackorder}
                      onCheckedChange={(checked) =>
                        update(index, { ...variant, allowBackorder: checked === true })
                      }
                    />
                    Allow backorders
                  </label>
                </div>

                <Labelled label="Image URL" id={`img-src-${index}`}>
                  <div className="flex gap-2">
                    <Input
                      id={`img-src-${index}`}
                      value={variant.image?.src ?? ""}
                      placeholder="e.g. https://cdn.example.com/shirt-black-m.webp"
                      onChange={(event) =>
                        update(index, {
                          ...variant,
                          image: event.target.value
                            ? { src: event.target.value, alt: variant.image?.alt ?? "" }
                            : null,
                        })
                      }
                      className="h-10 min-w-0 flex-1 rounded-md text-xs"
                    />
                    {/* The same upload the thumbnail offers, so a variant
                        picture does not have to exist somewhere first. */}
                    <UploadButton
                      label={`variant ${index + 1}`}
                      onUploaded={(src) =>
                        update(index, {
                          ...variant,
                          image: { src, alt: variant.image?.alt ?? "" },
                        })
                      }
                    />
                  </div>
                </Labelled>

                <Labelled label="Image alt text" id={`img-alt-${index}`}>
                  <Input
                    id={`img-alt-${index}`}
                    value={variant.image?.alt ?? ""}
                    placeholder="e.g. Black medium t-shirt"
                    onChange={(event) =>
                      update(index, {
                        ...variant,
                        image: { src: variant.image?.src ?? "", alt: event.target.value },
                      })
                    }
                    className="h-10 rounded-md text-xs"
                  />
                </Labelled>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Labelled({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * A variant's own image: click to upload, or drop one on it.
 *
 * Deliberately just a square - a URL box per row would triple the height of a
 * twenty-row matrix, and the product's thumbnail is already the sensible
 * default that the generate call fills in.
 */
function VariantImage({
  value,
  onChange,
  label,
}: {
  value: AdminImage | null;
  onChange: (next: AdminImage | null) => void;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (checkImage(file)) {
      toast.error(checkImage(file)!);
      return;
    }
    setBusy(true);
    try {
      const { data } = await mediaApi.upload(file, "variant");
      onChange({ src: data.media.url, alt: value?.alt ?? "" });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={`Image for ${label}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = [...event.dataTransfer.files].find((entry) =>
          entry.type.startsWith("image/"),
        );
        if (file) void upload(file);
      }}
      className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-muted/30 transition-colors hover:border-brand/50"
    >
      {value?.src ? (
        <Image
          src={value.src}
          alt=""
          fill
          sizes="44px"
          className="object-contain p-0.5"
          unoptimized
        />
      ) : (
        <span className="flex h-full items-center justify-center text-muted-foreground">
          <ImagePlus className="size-4" aria-hidden />
        </span>
      )}

      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Loader2 className="size-4 animate-spin" aria-hidden />
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
    </button>
  );
}

/** A compact "choose a file" that hands back the stored URL. */
function UploadButton({
  label,
  onUploaded,
}: {
  label: string;
  onUploaded: (src: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label={`Upload an image for ${label}`}
        className="h-10 shrink-0 cursor-pointer gap-1.5 rounded-md px-3 text-xs font-medium"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Upload className="size-3.5" aria-hidden />
        )}
        Upload
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;

          const rejected = checkImage(file);
          if (rejected) {
            toast.error(rejected);
            return;
          }

          setBusy(true);
          try {
            const { data } = await mediaApi.upload(file, "variant");
            onUploaded(data.media.url);
          } catch (error) {
            toast.error(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
