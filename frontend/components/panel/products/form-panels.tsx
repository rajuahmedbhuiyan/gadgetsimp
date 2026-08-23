"use client";

/**
 * The contents of each product tab.
 *
 * Every panel takes the whole form state and a setter, rather than owning a
 * slice: fields interact across tabs - the variant matrix seeds from the base
 * price, the Basics warning depends on status *and* visibility - and threading
 * eight separate slices around to express that costs more than it saves.
 *
 * Spacing is deliberately tight (`gap-3`, 36-40px controls). These are forms
 * staff fill in dozens of times, where a compact panel means fewer scrolls,
 * not a cramped one.
 */

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminImage, CategoryLeaf, TaxonomyRef } from "@/lib/api/admin/products";
import type { FieldErrors, ProductFormState } from "@/lib/panel/product-form";
import {
  integerOnly,
  normaliseSku,
  normaliseSlug,
  numericOnly,
  parsePastedSpecs,
  seoFromProduct,
  skuToken,
} from "@/lib/panel/product-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { BrandPicker, CategoryLeafPicker } from "./pickers";
import { ImageManager, ThumbnailField, fromRows, toRows } from "./image-manager";
import { RichTextEditor } from "./rich-text-editor";
import { VariationsBuilder } from "./variations-builder";
import {
  SelectLabelFor,
  STATUS_LABELS,
  STOCK_STATUS_LABELS,
  TagsInput,
  VISIBILITY_LABELS,
} from "./fields";

export type Setter = Dispatch<SetStateAction<ProductFormState>>;

export interface PanelProps {
  state: ProductFormState;
  setState: Setter;
  errors: FieldErrors;
  /** Only leaves are selectable; each carries the branch above it. */
  leaves: CategoryLeaf[];
  brands: TaxonomyRef[];
}

const CONTROL = "h-11 rounded-lg text-sm";
const SELECT = "w-full cursor-pointer rounded-lg text-sm data-[size=default]:h-11";

/* --------------------------------- shared --------------------------------- */

function Row({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium text-foreground/90"
      >
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="shrink-0 cursor-pointer"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/* --------------------------------- basics --------------------------------- */

export function BasicsPanel({
  state,
  setState,
  errors,
  leaves,
  brands,
}: PanelProps) {
  const set = <K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) => setState((current) => ({ ...current, [key]: value }));

  const hidden = state.status !== "ACTIVE" || state.visibility !== "PUBLIC";

  return (
    // Main column and a narrower sidebar: what the product *is* on the left,
    // what it costs and whether it is on sale on the right - which is roughly
    // the order those decisions get made in.
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      {/* -------------------------------------------------- identity -- */}
      <div className="flex flex-col gap-3">
        <Row label="Name" htmlFor="f-name" required error={errors.name}>
          <Input
            id="f-name"
            value={state.name}
            placeholder="e.g. Nike Sports T-Shirt"
            className={CONTROL}
            onChange={(event) => {
              const name = event.target.value;
              // The slug tracks the name until the slug is edited by hand,
              // which is the point at which it becomes a deliberate choice.
              setState((current) => ({
                ...current,
                name,
                // Slug and SKU both track the name until each is edited by
                // hand, which is the point at which it becomes deliberate.
                slug:
                  current.slug === "" ||
                  current.slug === normaliseSlug(current.name, { final: true })
                    ? normaliseSlug(name, { final: true })
                    : current.slug,
                sku:
                  current.sku === "" || current.sku === skuToken(current.name)
                    ? skuToken(name)
                    : current.sku,
              }));
            }}
          />
        </Row>

        <div className="grid gap-3 sm:grid-cols-2">
          <Row
            label="Slug"
            htmlFor="f-slug"
            required
            error={errors.slug}
            hint={`/shop/${state.slug || "…"}`}
          >
            <div className="flex gap-2">
              <Input
                id="f-slug"
                value={state.slug}
                placeholder="e.g. nike-sports-t-shirt"
                className={cn(CONTROL, "min-w-0 flex-1 font-mono text-xs")}
                // Corrected as it is typed rather than flagged afterwards: a
                // space or a capital is a 422 from this API, not a preference.
                onChange={(event) => set("slug", normaliseSlug(event.target.value))}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => set("slug", normaliseSlug(state.name, { final: true }))}
                className="h-11 shrink-0 cursor-pointer rounded-lg px-2.5 text-xs"
              >
                From name
              </Button>
            </div>
          </Row>

          <Row
            label="SKU"
            htmlFor="f-sku"
            error={errors.sku}
            hint="Uppercase, hyphen-separated."
          >
            <div className="flex gap-2">
              <Input
                id="f-sku"
                value={state.sku}
                placeholder="e.g. NIKE-SPORTS"
                className={cn(CONTROL, "min-w-0 flex-1 font-mono text-xs")}
                onChange={(event) => set("sku", normaliseSku(event.target.value))}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => set("sku", skuToken(state.name))}
                className="h-11 shrink-0 cursor-pointer rounded-lg px-2.5 text-xs"
              >
                From name
              </Button>
            </div>
          </Row>
        </div>

        <Row
          label="Category"
          htmlFor="f-category"
          required
          error={errors.categoryId}
          hint="The most specific one. Its parent categories are added for you."
        >
          <CategoryLeafPicker
            id="f-category"
            leaves={leaves}
            value={state.categoryId}
            onChange={(next) => set("categoryId", next)}
            invalid={Boolean(errors.categoryId)}
          />
        </Row>

        <Row label="Brand">
          <BrandPicker
            brands={brands}
            value={state.brandId}
            onChange={(next) => set("brandId", next)}
          />
        </Row>

        <Row label="Tags">
          <TagsInput value={state.tags} onChange={(next) => set("tags", next)} />
        </Row>
      </div>

      {/* --------------------------------------------------- sidebar -- */}
      <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-3">
        <Section title="Price">
          <div className="grid grid-cols-2 gap-3">
            <Row
              label="Selling price"
              htmlFor="f-price"
              required
              error={errors.sellingPrice}
            >
              <Input
                id="f-price"
                inputMode="decimal"
                value={state.sellingPrice}
                placeholder="e.g. 1299"
                className={cn(CONTROL, "tabular-nums")}
                onChange={(event) => set("sellingPrice", numericOnly(event.target.value))}
              />
            </Row>

            <Row label="Was price" htmlFor="f-was" error={errors.originalPrice}>
              <Input
                id="f-was"
                inputMode="decimal"
                value={state.originalPrice}
                placeholder="e.g. 1499"
                className={cn(CONTROL, "tabular-nums")}
                onChange={(event) => set("originalPrice", numericOnly(event.target.value))}
              />
            </Row>
          </div>

          {state.productType === "VARIABLE" ? (
            <p className="rounded-lg border border-warning/30 bg-warning/8 px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
              Variable product — the storefront shows the range across its
              variants. This is the fallback.
            </p>
          ) : null}
        </Section>

        <Section title="Stock">
          <Toggle
            label="Track inventory"
            hint="Off means always available."
            checked={state.trackInventory}
            onChange={(value) => set("trackInventory", value)}
          />

          {/* Quantity means nothing when inventory is not tracked, so it is
              hidden rather than shown holding a number nothing reads. */}
          {state.trackInventory ? (
            <div className="grid grid-cols-2 gap-3">
              <Row label="Quantity" htmlFor="f-qty" error={errors.quantity}>
                <Input
                  id="f-qty"
                  inputMode="numeric"
                  value={state.quantity}
                  className={cn(CONTROL, "tabular-nums")}
                  onChange={(event) => set("quantity", integerOnly(event.target.value))}
                />
              </Row>

              <Row
                label="Low stock at"
                htmlFor="f-low"
                error={errors.lowStockThreshold}
              >
                <Input
                  id="f-low"
                  inputMode="numeric"
                  value={state.lowStockThreshold}
                  className={cn(CONTROL, "tabular-nums")}
                  onChange={(event) =>
                    set("lowStockThreshold", integerOnly(event.target.value))
                  }
                />
              </Row>
            </div>
          ) : null}

          <Toggle
            label="Allow backorders"
            checked={state.allowBackorder}
            onChange={(value) => set("allowBackorder", value)}
          />

          <Row label="Stock status" htmlFor="f-stock-status">
            <Select
              value={state.stockStatus}
              onValueChange={(value) =>
                set("stockStatus", String(value) as ProductFormState["stockStatus"])
              }
            >
              <SelectTrigger id="f-stock-status" className={SELECT}>
                <SelectLabelFor options={STOCK_STATUS_LABELS} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_STOCK" className="cursor-pointer text-sm">In stock</SelectItem>
                <SelectItem value="OUT_OF_STOCK" className="cursor-pointer text-sm">Out of stock</SelectItem>
                <SelectItem value="BACKORDER" className="cursor-pointer text-sm">Backorder</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </Section>

        <Section title="Visibility">
          <div className="grid grid-cols-2 gap-3">
            <Row label="Status" htmlFor="f-status">
              <Select
                value={state.status}
                onValueChange={(value) =>
                  set("status", String(value) as ProductFormState["status"])
                }
              >
                <SelectTrigger id="f-status" className={SELECT}>
                  <SelectLabelFor options={STATUS_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE" className="cursor-pointer text-sm">Active</SelectItem>
                  <SelectItem value="DRAFT" className="cursor-pointer text-sm">Draft</SelectItem>
                  <SelectItem value="OUT_OF_STOCK" className="cursor-pointer text-sm">Out of stock</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            <Row label="Visibility" htmlFor="f-visibility">
              <Select
                value={state.visibility}
                onValueChange={(value) =>
                  set("visibility", String(value) as ProductFormState["visibility"])
                }
              >
                <SelectTrigger id="f-visibility" className={SELECT}>
                  <SelectLabelFor options={VISIBILITY_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC" className="cursor-pointer text-sm">Public</SelectItem>
                  <SelectItem value="HIDDEN" className="cursor-pointer text-sm">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </div>

          <Toggle
            label="Featured"
            hint="Shows in the home page's featured row."
            checked={state.featured}
            onChange={(value) => set("featured", value)}
          />

          {hidden ? (
            <p className="rounded-lg border border-warning/30 bg-warning/8 px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
              Not Active and Public, so this stays off the storefront — and the
              products list shows published records only, so it will not appear
              there either.
            </p>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

/* ------------------------------ description ------------------------------- */

export function DescriptionPanel({ state, setState, errors }: PanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <Row
        label="Short description"
        htmlFor="f-short"
        error={errors.shortDescription}
        hint={`${state.shortDescription.length}/600 — one line for cards and search results.`}
      >
        <Textarea
          id="f-short"
          rows={2}
          value={state.shortDescription}
          placeholder="e.g. Lightweight performance t-shirt."
          className="rounded-lg text-sm"
          onChange={(event) =>
            setState((current) => ({
              ...current,
              shortDescription: event.target.value,
            }))
          }
        />
      </Row>

      <Row label="Full description" required error={errors.description}>
        <RichTextEditor
          value={state.description}
          invalid={Boolean(errors.description)}
          onChange={(html) =>
            setState((current) => ({ ...current, description: html }))
          }
        />
      </Row>
    </div>
  );
}

/* -------------------------------- pricing --------------------------------- */

export function PricingPanel({ state, setState, errors }: PanelProps) {
  const set = <K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) => setState((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Price">
        <div className="grid grid-cols-2 gap-3">
          <Row label="Selling price" htmlFor="f-price" required error={errors.sellingPrice}>
            <Input
              id="f-price"
              inputMode="decimal"
              value={state.sellingPrice}
              placeholder="e.g. 1299"
              className={cn(CONTROL, "tabular-nums")}
              onChange={(event) => set("sellingPrice", numericOnly(event.target.value))}
            />
          </Row>

          <Row
            label="Was price"
            htmlFor="f-was"
            error={errors.originalPrice}
            hint="Struck through on the storefront."
          >
            <Input
              id="f-was"
              inputMode="decimal"
              value={state.originalPrice}
              placeholder="e.g. 1499"
              className={cn(CONTROL, "tabular-nums")}
              onChange={(event) => set("originalPrice", numericOnly(event.target.value))}
            />
          </Row>
        </div>

        {state.productType === "VARIABLE" ? (
          <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            This is a variable product, so the storefront shows the range across
            its variants. What is set here is the fallback.
          </p>
        ) : null}
      </Section>

      <Section title="Stock">
        <Toggle
          label="Track inventory"
          hint="Off means always available."
          checked={state.trackInventory}
          onChange={(value) => set("trackInventory", value)}
        />

        {state.trackInventory ? (
          <div className="grid grid-cols-2 gap-3">
            <Row label="Quantity" htmlFor="f-qty" error={errors.quantity}>
              <Input
                id="f-qty"
                inputMode="numeric"
                value={state.quantity}
                className={cn(CONTROL, "tabular-nums")}
                onChange={(event) => set("quantity", integerOnly(event.target.value))}
              />
            </Row>
            <Row
              label="Low stock at"
              htmlFor="f-low"
              error={errors.lowStockThreshold}
            >
              <Input
                id="f-low"
                inputMode="numeric"
                value={state.lowStockThreshold}
                className={cn(CONTROL, "tabular-nums")}
                onChange={(event) => set("lowStockThreshold", event.target.value)}
              />
            </Row>
          </div>
        ) : null}

        <Toggle
          label="Allow backorders"
          checked={state.allowBackorder}
          onChange={(value) => set("allowBackorder", value)}
        />

        <Row label="Stock status" htmlFor="f-stock-status">
          <Select
            value={state.stockStatus}
            onValueChange={(value) =>
              set("stockStatus", String(value) as ProductFormState["stockStatus"])
            }
          >
            <SelectTrigger id="f-stock-status" className={SELECT}>
              <SelectLabelFor options={STOCK_STATUS_LABELS} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="IN_STOCK" className="cursor-pointer text-sm">In stock</SelectItem>
              <SelectItem value="OUT_OF_STOCK" className="cursor-pointer text-sm">Out of stock</SelectItem>
              <SelectItem value="BACKORDER" className="cursor-pointer text-sm">Backorder</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>
    </div>
  );
}

/* -------------------------------- variants -------------------------------- */

export function VariantsPanel({ state, setState, errors, editing }: PanelProps & { editing?: boolean }) {
  const variable = state.productType === "VARIABLE";

  return (
    <div className="flex flex-col gap-3">
      {/*
        * The type cannot be changed after creation. Flipping VARIABLE to
        * SIMPLE would orphan every generated SKU and the reverse would leave a
        * product marked variable with nothing to buy - which is why the API's
        * `patchGeneral` has no `productType` field either.
        */}
      {editing ? (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          This product is <strong className="text-foreground">{variable ? "variable" : "simple"}</strong>.
          The type is fixed once a product exists — changing it would orphan its
          SKUs. Variants themselves are managed from the Variations screen.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(["SIMPLE", "VARIABLE"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() =>
                setState((current) => ({ ...current, productType: type }))
              }
              className={cn(
                "cursor-pointer rounded-lg border p-3 text-left transition-colors",
                state.productType === type
                  ? "border-brand bg-brand/8"
                  : "hover:border-brand/40 hover:bg-muted/40",
              )}
            >
              <span className="block text-sm font-semibold">
                {type === "SIMPLE" ? "Simple" : "Variable"}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {type === "SIMPLE"
                  ? "One price, one SKU, one stock count."
                  : "Sizes or colours, each with its own price and stock."}
              </span>
            </button>
          ))}
        </div>
      )}

      {variable && !editing ? (
        <>
          {errors.axes ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
              {errors.axes}
            </p>
          ) : null}
          {errors.variants ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
              {errors.variants}
            </p>
          ) : null}

          {/* Blank SKUs are filled in by the API from the product's own SKU
              or slug plus the option values, so they are worth leaving empty
              unless a specific code is needed. */}
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Leave a SKU blank and the API derives one —{" "}
            <span className="font-mono">
              {(state.sku || state.slug || "product").toUpperCase()}-BLACK-M
            </span>
            .
          </p>

          <VariationsBuilder
            axes={state.axes}
            onAxesChange={(axes) => setState((current) => ({ ...current, axes }))}
            variants={state.variants}
            onVariantsChange={(variants) =>
              setState((current) => ({ ...current, variants }))
            }
            // Everything the generate endpoint accepts as a per-row default,
            // taken from what has already been filled in elsewhere.
            // Whatever the API would hang variant SKUs off: the product SKU
            // if there is one, otherwise its slug - exactly the server's own
            // `created.sku ?? created.slug`.
            skuBase={state.sku || state.slug}
            defaults={{
              ...(state.sellingPrice && Number.isFinite(Number(state.sellingPrice))
                ? { sellingPrice: Number(state.sellingPrice) }
                : {}),
              ...(state.originalPrice && Number(state.originalPrice) > 0
                ? { originalPrice: Number(state.originalPrice) }
                : {}),
              stock: {
                quantity: Number(state.quantity || 0),
                trackInventory: state.trackInventory,
                allowBackorder: state.allowBackorder,
                lowStockThreshold: Number(state.lowStockThreshold || 0),
                status: state.stockStatus,
              },
              status: state.status,
              ...(state.thumbnail?.src ? { image: state.thumbnail } : {}),
            }}
          />
        </>
      ) : null}

      {!variable && !editing ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          A simple product has no variants. Choose Variable above to add sizes
          or colours.
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------- media ---------------------------------- */

export function MediaPanel({ state, setState, errors }: PanelProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      {/* The thumbnail is its own field, not the first row of the gallery.
          It is what every product card in the shop shows, and it is the one
          image the API requires - so it gets its own control rather than
          depending on the order of a list. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Thumbnail
        </h3>
        <p className="text-xs text-muted-foreground">
          Shown on every product card. Required.
        </p>

        <ThumbnailField
          value={state.thumbnail}
          onChange={(next: AdminImage | null) =>
            setState((current) => ({ ...current, thumbnail: next }))
          }
          invalid={Boolean(errors.thumbnail)}
        />

        {errors.thumbnail ? (
          <p className="text-xs text-destructive">{errors.thumbnail}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Gallery
        </h3>
        <p className="text-xs text-muted-foreground">
          The product page carousel, in this order. Drag to rearrange.
        </p>

        {errors.images ? (
          <p className="text-xs text-destructive">{errors.images}</p>
        ) : null}

        <ImageManager
          rows={toRows(state.images)}
          onChange={(rows) =>
            setState((current) => ({ ...current, images: fromRows(rows) }))
          }
        />
      </div>
    </div>
  );
}

/* --------------------------------- specs ---------------------------------- */

export function SpecsPanel(props: PanelProps & { editing?: boolean }) {
  return (
    // Side by side from `lg`: two short, unrelated lists read better as two
    // columns than as one column with the second half below the fold.
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <SpecFields {...props} />
      <div className="border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
        <ShippingFields {...props} />
      </div>
    </div>
  );
}

function SpecFields({
  state,
  setState,
  errors,
}: PanelProps & { editing?: boolean }) {
  const [pasteText, setPasteText] = useState("");
  const [pasteResult, setPasteResult] = useState<string | null>(null);

  const update = (index: number, next: ProductFormState["specs"][number]) =>
    setState((current) => ({
      ...current,
      specs: current.specs.map((group, at) => (at === index ? next : group)),
    }));

  const importSpecs = () => {
    const existingKeys = state.specs.flatMap((group) =>
      group.options.map((option) => option.key.trim()).filter(Boolean),
    );
    const parsed = parsePastedSpecs(pasteText, existingKeys);
    const rowCount = parsed.groups.reduce(
      (count, group) => count + group.options.length,
      0,
    );

    if (rowCount === 0) {
      setPasteResult("No specs found. Use headings like ### Memory, then key/value lines.");
      return;
    }

    setState((current) => {
      const realGroups = current.specs.filter(groupFilled);

      return {
        ...current,
        specs: [...realGroups, ...parsed.groups],
      };
    });
    setPasteText("");
    setPasteResult(
      `Imported ${rowCount} row${rowCount === 1 ? "" : "s"} in ${
        parsed.groups.length
      } group${parsed.groups.length === 1 ? "" : "s"}${
        parsed.skipped ? `; skipped ${parsed.skipped} unpaired line${parsed.skipped === 1 ? "" : "s"}` : ""
      }.`,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {errors.specs ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          {errors.specs}
        </p>
      ) : null}

      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Import specs</h3>
            <p className="text-xs text-muted-foreground">
              Paste copied specs with headings and key/value lines.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={importSpecs}
            disabled={!pasteText.trim()}
            className="h-9 cursor-pointer gap-1.5 rounded-lg px-3 text-xs"
          >
            <Plus className="size-3.5" aria-hidden />
            Fill attributes
          </Button>
        </div>
        <Textarea
          value={pasteText}
          placeholder={"e.g.\n### Memory\nMemory Type\n**DDR4**\nBus Speed\n**3200MHz**"}
          className="mt-3 min-h-32 resize-y rounded-lg text-xs"
          onChange={(event) => {
            setPasteText(event.target.value);
            setPasteResult(null);
          }}
        />
        {pasteResult ? (
          <p className="mt-2 text-xs text-muted-foreground">{pasteResult}</p>
        ) : null}
      </div>

      {state.specs.map((group, groupIndex) => (
        <div key={groupIndex} className="rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Input
              value={group.title}
              placeholder="e.g. General Info"
              aria-label={`Group ${groupIndex + 1} title`}
              className={cn(CONTROL, "flex-1 font-medium")}
              onChange={(event) =>
                update(groupIndex, { ...group, title: event.target.value })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove group"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  specs: current.specs.filter((_, at) => at !== groupIndex),
                }))
              }
              className="size-10 shrink-0 cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>

          {/* Column headings, so the two boxes are labelled once for the
              whole list rather than not at all. */}
          <div className="mt-3 flex items-center gap-2 px-0.5">
            <span className="w-1/3 text-xs font-medium text-muted-foreground">
              Key
            </span>
            <span className="flex-1 text-xs font-medium text-muted-foreground">
              Value
            </span>
            <span className="size-9 shrink-0" aria-hidden />
          </div>

          <div className="mt-1 flex flex-col gap-2">
            {group.options.map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2">
                <Input
                  value={option.key}
                  placeholder="e.g. material"
                  aria-label={`Key for row ${optionIndex + 1}`}
                  className="h-10 w-1/3 rounded-md font-mono text-xs"
                  onChange={(event) =>
                    update(groupIndex, {
                      ...group,
                      options: group.options.map((item, at) =>
                        at === optionIndex
                          ? { ...item, key: event.target.value.toLowerCase() }
                          : item,
                      ),
                    })
                  }
                />
                <Input
                  value={option.value}
                  placeholder="e.g. cotton (comma-separate for several)"
                  aria-label={`Value for row ${optionIndex + 1}`}
                  className="h-10 flex-1 rounded-md text-xs"
                  onChange={(event) =>
                    update(groupIndex, {
                      ...group,
                      options: group.options.map((item, at) =>
                        at === optionIndex
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove row"
                  onClick={() =>
                    update(groupIndex, {
                      ...group,
                      options: group.options.filter((_, at) => at !== optionIndex),
                    })
                  }
                  className="size-9 shrink-0 cursor-pointer text-muted-foreground"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                update(groupIndex, {
                  ...group,
                  options: [...group.options, { key: "", value: "" }],
                })
              }
              className="h-9 cursor-pointer gap-1.5 self-start rounded-lg px-3 text-xs"
            >
              <Plus className="size-3.5" aria-hidden />
              Add row
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setState((current) => ({
            ...current,
            specs: [...current.specs, { title: "", options: [{ key: "", value: "" }] }],
          }))
        }
        className="h-10 cursor-pointer gap-1.5 self-start rounded-lg px-4 text-sm"
      >
        <Plus className="size-4" aria-hidden />
        Add group
      </Button>

    </div>
  );
}

function groupFilled(group: ProductFormState["specs"][number]) {
  return group.title.trim() || group.options.some(optionFilled);
}

function optionFilled(option: ProductFormState["specs"][number]["options"][number]) {
  return option.key.trim() || option.value.trim();
}

/* -------------------------------- shipping -------------------------------- */

function ShippingFields({
  state,
  setState,
  errors,
  editing,
}: PanelProps & { editing?: boolean }) {
  const set = <K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) => setState((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex flex-col gap-3">
      {/*
        * There is no `PATCH /products/:id/shipping`. The API's section patches
        * cover general, description, pricing, stock, attributes, media and seo
        * - shipping is settable at creation and otherwise only through a full
        * `PUT`, which would risk resetting fields this screen has not loaded.
        */}
      {editing ? (
        <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Shipping has no section endpoint on the API, so it cannot be saved
          from here — it is set when the product is created. These values are
          shown for reference.
        </p>
      ) : null}

      <fieldset disabled={editing} className={cn(editing && "opacity-60")}>
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Requires shipping"
              checked={state.requiresShipping}
              onChange={(value) => set("requiresShipping", value)}
            />
            <Toggle
              label="Free shipping"
              checked={state.freeShipping}
              onChange={(value) => set("freeShipping", value)}
            />
          </div>

          <Section title="Weight">
            <Row label="Weight" htmlFor="f-weight">
            <div className="flex gap-2">
              <Input
                id="f-weight"
                inputMode="decimal"
                value={state.weightValue}
                placeholder="e.g. 0.25"
                className={cn(CONTROL, "flex-1 tabular-nums")}
                onChange={(event) => set("weightValue", numericOnly(event.target.value))}
              />
              <Select
                value={state.weightUnit}
                onValueChange={(value) =>
                  set("weightUnit", String(value) as ProductFormState["weightUnit"])
                }
              >
                <SelectTrigger aria-label="Weight unit" className={cn(SELECT, "w-24")}>
                  <SelectLabelFor options={{ g: "g", kg: "kg", oz: "oz", lb: "lb" }} />
                </SelectTrigger>
                <SelectContent>
                  {["g", "kg", "oz", "lb"].map((unit) => (
                    <SelectItem key={unit} value={unit} className="cursor-pointer text-sm">
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </Row>
            {errors.weightValue ? (
              <p className="text-xs text-destructive">{errors.weightValue}</p>
            ) : null}
          </Section>

          <Section title="Dimensions">
            <div className="flex items-end gap-2">
              {(
                [
                  ["length", "Length", "e.g. 30"],
                  ["width", "Width", "e.g. 24"],
                  ["height", "Height", "e.g. 3"],
                ] as const
              ).map(([field, label, example]) => (
                <Row key={field} label={label} htmlFor={`f-${field}`}>
                  <Input
                    id={`f-${field}`}
                    inputMode="decimal"
                    value={state[field]}
                    placeholder={example}
                    className={cn(CONTROL, "w-full tabular-nums")}
                    onChange={(event) => set(field, numericOnly(event.target.value))}
                  />
                </Row>
              ))}
              <Select
                value={state.dimensionUnit}
                onValueChange={(value) =>
                  set("dimensionUnit", String(value) as ProductFormState["dimensionUnit"])
                }
              >
                <SelectTrigger aria-label="Dimension unit" className={cn(SELECT, "w-24")}>
                  <SelectLabelFor options={{ mm: "mm", cm: "cm", m: "m", in: "in" }} />
                </SelectTrigger>
                <SelectContent>
                  {["mm", "cm", "m", "in"].map((unit) => (
                    <SelectItem key={unit} value={unit} className="cursor-pointer text-sm">
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(["length", "width", "height"] as const).some((f) => errors[f]) ? (
              <p className="text-xs text-destructive">
                Dimensions must be numbers.
              </p>
            ) : null}
          </Section>
        </div>
      </fieldset>
    </div>
  );
}

/* ----------------------------------- seo ---------------------------------- */

export function SeoPanel({ state, setState, errors }: PanelProps) {
  const set = <K extends keyof ProductFormState>(
    key: K,
    value: ProductFormState[K],
  ) => setState((current) => ({ ...current, [key]: value }));

  const derived = seoFromProduct(state);
  // Only offered when it would actually change something, so the button is
  // never a no-op sitting there inviting a click.
  const canFill = Object.entries(derived).some(
    ([key, value]) => value && !state[key as keyof ProductFormState],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Anything left blank falls back to the product&apos;s own name and
            short description when it is saved.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={!canFill}
            onClick={() => setState((current) => ({ ...current, ...derived }))}
            className="h-9 shrink-0 cursor-pointer rounded-lg px-3 text-xs font-medium"
          >
            Fill from product
          </Button>
        </div>
      </div>
      <Section title="Search result">
        <Row
          label="Title"
          htmlFor="f-seo-title"
          error={errors.seoTitle}
          hint={`${state.seoTitle.length}/70 — blank uses the product name.`}
        >
          <Input
            id="f-seo-title"
            value={state.seoTitle}
            className={CONTROL}
            onChange={(event) => set("seoTitle", event.target.value)}
          />
        </Row>

        <Row
          label="Description"
          htmlFor="f-seo-desc"
          error={errors.seoDescription}
          hint={`${state.seoDescription.length}/320`}
        >
          <Textarea
            id="f-seo-desc"
            rows={3}
            value={state.seoDescription}
            className="rounded-lg text-sm"
            onChange={(event) => set("seoDescription", event.target.value)}
          />
        </Row>

        <Row label="Keywords">
          <TagsInput
            value={state.seoKeywords}
            onChange={(next) => set("seoKeywords", next)}
            placeholder="e.g. sports t-shirt — then press Enter"
          />
        </Row>

        <Row
          label="Canonical URL"
          htmlFor="f-canonical"
          error={errors.canonicalUrl}
        >
          <Input
            id="f-canonical"
            value={state.canonicalUrl}
            placeholder="e.g. https://gadgetsimp.dev/shop/nike-sports-t-shirt"
            className={CONTROL}
            onChange={(event) => set("canonicalUrl", event.target.value)}
          />
        </Row>

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              checked={state.noIndex}
              onCheckedChange={(checked) => set("noIndex", checked === true)}
            />
            Ask search engines not to index this
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox
              checked={state.noFollow}
              onCheckedChange={(checked) => set("noFollow", checked === true)}
            />
            Ask them not to follow its links
          </label>
        </div>
      </Section>

      <Section title="Shared links">
        <Row
          label="Open Graph title"
          htmlFor="f-og-title"
          error={errors.ogTitle}
          hint={`${state.ogTitle.length}/95 — Facebook, WhatsApp, LinkedIn.`}
        >
          <Input
            id="f-og-title"
            value={state.ogTitle}
            className={CONTROL}
            onChange={(event) => set("ogTitle", event.target.value)}
          />
        </Row>

        <Row
          label="Open Graph description"
          htmlFor="f-og-desc"
          error={errors.ogDescription}
          hint={`${state.ogDescription.length}/300`}
        >
          <Textarea
            id="f-og-desc"
            rows={2}
            value={state.ogDescription}
            className="rounded-lg text-sm"
            onChange={(event) => set("ogDescription", event.target.value)}
          />
        </Row>

        <Row label="Open Graph image" htmlFor="f-og-image" error={errors.ogImage}>
          <Input
            id="f-og-image"
            value={state.ogImage}
            placeholder="e.g. https://cdn.example.com/image.webp"
            className={CONTROL}
            onChange={(event) => set("ogImage", event.target.value)}
          />
        </Row>

        <Row
          label="Twitter title"
          htmlFor="f-tw-title"
          error={errors.twitterTitle}
          hint={`${state.twitterTitle.length}/70`}
        >
          <Input
            id="f-tw-title"
            value={state.twitterTitle}
            className={CONTROL}
            onChange={(event) => set("twitterTitle", event.target.value)}
          />
        </Row>

        <Row
          label="Twitter description"
          htmlFor="f-tw-desc"
          error={errors.twitterDescription}
          hint={`${state.twitterDescription.length}/200`}
        >
          <Textarea
            id="f-tw-desc"
            rows={2}
            value={state.twitterDescription}
            className="rounded-lg text-sm"
            onChange={(event) => set("twitterDescription", event.target.value)}
          />
        </Row>

        <Row
          label="Twitter image"
          htmlFor="f-tw-image"
          error={errors.twitterImage}
        >
          <Input
            id="f-tw-image"
            value={state.twitterImage}
            placeholder="e.g. https://cdn.example.com/image.webp"
            className={CONTROL}
            onChange={(event) => set("twitterImage", event.target.value)}
          />
        </Row>
      </Section>
    </div>
  );
}

/** Small summary chips for the form header. */
export function FormSummary({ state }: { state: ProductFormState }) {
  const live = state.status === "ACTIVE" && state.visibility === "PUBLIC";
  const images =
    (state.thumbnail?.src.trim() ? 1 : 0) +
    state.images.filter((image) => image.src.trim()).length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        className={cn(
          "font-normal",
          live
            ? "bg-success/12 text-success"
            : "bg-warning/15 text-warning-foreground dark:text-warning",
        )}
      >
        {live ? "Live" : "Not published"}
      </Badge>
      <Badge variant="outline" className="font-normal">
        {state.productType === "VARIABLE" ? "Variable" : "Simple"}
      </Badge>
      {state.productType === "VARIABLE" && state.variants.length > 0 ? (
        <Badge variant="outline" className="font-normal">
          {state.variants.length} variants
        </Badge>
      ) : null}
      <Badge variant="outline" className="font-normal">
        {images} {images === 1 ? "image" : "images"}
      </Badge>
    </div>
  );
}
