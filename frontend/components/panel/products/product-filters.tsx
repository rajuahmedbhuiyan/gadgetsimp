"use client";

import { useState } from "react";
import { Filter, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  PRODUCT_VISIBILITIES,
  STOCK_STATUSES,
  type ProductStatus,
  type ProductType,
  type ProductVisibility,
  type StockStatus,
  type TaxonomyRef,
} from "@/lib/api/admin/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const PRODUCT_SORTS = [
  { value: "newest", label: "Newest first", field: "createdAt", direction: "desc" },
  { value: "oldest", label: "Oldest first", field: "createdAt", direction: "asc" },
  { value: "updated", label: "Recently updated", field: "updatedAt", direction: "desc" },
  { value: "name-asc", label: "Name A-Z", field: "name", direction: "asc" },
  { value: "name-desc", label: "Name Z-A", field: "name", direction: "desc" },
  { value: "price-asc", label: "Price low to high", field: "price", direction: "asc" },
  { value: "price-desc", label: "Price high to low", field: "price", direction: "desc" },
] as const;

export interface ProductFilterState {
  search: string;
  categoryId: string;
  brandId: string;
  status: ProductStatus | "";
  visibility: ProductVisibility | "";
  productType: ProductType | "";
  stockStatus: StockStatus | "";
  featured: "any" | "yes" | "no";
  minPrice: string;
  maxPrice: string;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
  sort: string;
  limit: string;
}

const CONTROL = "h-10 rounded-lg text-sm";
const ALL = "__all__";

const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  OUT_OF_STOCK: "Out of stock",
};

const VISIBILITY_LABEL: Record<ProductVisibility, string> = {
  PUBLIC: "Public",
  HIDDEN: "Hidden",
};

const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  SIMPLE: "Simple",
  VARIABLE: "Variable",
};

const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  IN_STOCK: "In stock",
  OUT_OF_STOCK: "Out of stock",
  BACKORDER: "Backorder",
};

export function ProductFilters({
  value,
  onChange,
  onClear,
  categories,
  brands,
  resultCount,
}: {
  value: ProductFilterState;
  onChange: (patch: Partial<ProductFilterState>) => void;
  onClear: () => void;
  categories: TaxonomyRef[];
  brands: TaxonomyRef[];
  resultCount: number | null;
}) {
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(value);
  const touched = Boolean(value.search) || active > 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={value.search}
            placeholder="Search products..."
            aria-label="Search products by name"
            onChange={(event) => onChange({ search: event.target.value })}
            className={cn(
              CONTROL,
              "pl-9",
              value.search && "pr-9",
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />
          {value.search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange({ search: "" })}
              className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          aria-label="Open product filters"
          className={cn(CONTROL, "relative shrink-0 cursor-pointer gap-2 px-3")}
        >
          <Filter className="size-4" aria-hidden />
          <span className="max-sm:sr-only">Filters</span>
          {active > 0 ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold leading-5 text-brand-foreground">
              {active}
            </span>
          ) : null}
        </Button>

        {touched ? (
          <Button
            type="button"
            variant="outline"
            onClick={onClear}
            aria-label="Clear all filters"
            className={cn(CONTROL, "shrink-0 cursor-pointer gap-2 px-3")}
          >
            <X className="size-4" aria-hidden />
            <span className="max-sm:sr-only">Clear all</span>
          </Button>
        ) : null}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[460px]! max-w-[100vw]! overflow-y-auto">
          {open ? (
            <FilterDraft
              applied={value}
              categories={categories}
              brands={brands}
              resultCount={resultCount}
              onClose={() => setOpen(false)}
              onApply={(next) => {
                onChange(next);
                setOpen(false);
              }}
              onClear={() => {
                onClear();
                setOpen(false);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterDraft({
  applied,
  categories,
  brands,
  resultCount,
  onApply,
  onClear,
  onClose,
}: {
  applied: ProductFilterState;
  categories: TaxonomyRef[];
  brands: TaxonomyRef[];
  resultCount: number | null;
  onApply: (patch: Partial<ProductFilterState>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(applied);
  const patch = (next: Partial<ProductFilterState>) =>
    setDraft((current) => ({ ...current, ...next }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const priceBackwards =
    Boolean(draft.minPrice && draft.maxPrice) &&
    Number(draft.minPrice) > Number(draft.maxPrice);
  const createdBackwards =
    Boolean(draft.createdFrom && draft.createdTo) &&
    draft.createdFrom > draft.createdTo;
  const updatedBackwards =
    Boolean(draft.updatedFrom && draft.updatedTo) &&
    draft.updatedFrom > draft.updatedTo;
  const invalid = priceBackwards || createdBackwards || updatedBackwards;

  return (
    <>
      <SheetHeader className="border-b p-4 pr-12">
        <SheetTitle>Filter products</SheetTitle>
        <SheetDescription>
          Search applies immediately. Everything here waits for Apply.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 p-4">
        <Group label="Sort and page">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Sort by"
              value={draft.sort}
              options={PRODUCT_SORTS}
              labelFor={(option) => option.label}
              valueFor={(option) => option.value}
              onChange={(sort) => patch({ sort })}
            />
            <Labelled label="Page size" htmlFor="product-page-size">
              <Select
                value={draft.limit}
                onValueChange={(limit) => patch({ limit: String(limit) })}
              >
                <SelectTrigger
                  id="product-page-size"
                  aria-label="Products per page"
                  className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
                >
                  <SelectValue>{(current) => `${current} per page`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {["20", "50", "100"].map((option) => (
                    <SelectItem key={option} value={option}>
                      {option} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labelled>
          </div>
        </Group>

        <Group label="Catalogue">
          <div className="grid gap-3">
            <SelectField
              label="Category"
              value={draft.categoryId || ALL}
              allValue={ALL}
              allLabel="All categories"
              options={categories}
              labelFor={(category) => category.name}
              valueFor={(category) => category.id}
              onChange={(categoryId) =>
                patch({ categoryId: categoryId === ALL ? "" : categoryId })
              }
            />
            <SelectField
              label="Brand"
              value={draft.brandId || ALL}
              allValue={ALL}
              allLabel="All brands"
              options={brands}
              labelFor={(brand) => brand.name}
              valueFor={(brand) => brand.id}
              onChange={(brandId) => patch({ brandId: brandId === ALL ? "" : brandId })}
            />
          </div>
        </Group>

        <Group label="Lifecycle">
          <div className="grid gap-3 sm:grid-cols-2">
            <EnumSelect
              label="Status"
              value={draft.status}
              allLabel="All statuses"
              options={PRODUCT_STATUSES}
              labels={PRODUCT_STATUS_LABEL}
              onChange={(status) => patch({ status: status as ProductStatus | "" })}
            />
            <EnumSelect
              label="Visibility"
              value={draft.visibility}
              allLabel="All visibility"
              options={PRODUCT_VISIBILITIES}
              labels={VISIBILITY_LABEL}
              onChange={(visibility) =>
                patch({ visibility: visibility as ProductVisibility | "" })
              }
            />
            <EnumSelect
              label="Product type"
              value={draft.productType}
              allLabel="All types"
              options={PRODUCT_TYPES}
              labels={PRODUCT_TYPE_LABEL}
              onChange={(productType) =>
                patch({ productType: productType as ProductType | "" })
              }
            />
            <EnumSelect
              label="Stock"
              value={draft.stockStatus}
              allLabel="All stock"
              options={STOCK_STATUSES}
              labels={STOCK_STATUS_LABEL}
              onChange={(stockStatus) =>
                patch({ stockStatus: stockStatus as StockStatus | "" })
              }
            />
          </div>
          <Labelled label="Featured" htmlFor="product-featured">
            <Select
              value={draft.featured}
              onValueChange={(featured) =>
                patch({ featured: featured as ProductFilterState["featured"] })
              }
            >
              <SelectTrigger
                id="product-featured"
                aria-label="Filter by featured state"
                className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
              >
                <SelectValue>
                  {(current) =>
                    current === "yes"
                      ? "Featured only"
                      : current === "no"
                        ? "Not featured"
                        : "Any featured state"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any featured state</SelectItem>
                <SelectItem value="yes">Featured only</SelectItem>
                <SelectItem value="no">Not featured</SelectItem>
              </SelectContent>
            </Select>
          </Labelled>
        </Group>

        <Group label="Price range">
          <div className="grid grid-cols-2 gap-3">
            <Labelled label="Min" htmlFor="product-min-price">
              <Input
                id="product-min-price"
                type="number"
                min="0"
                inputMode="decimal"
                value={draft.minPrice}
                placeholder="e.g. 1000"
                onChange={(event) => patch({ minPrice: event.target.value })}
                aria-invalid={priceBackwards}
                className={CONTROL}
              />
            </Labelled>
            <Labelled label="Max" htmlFor="product-max-price">
              <Input
                id="product-max-price"
                type="number"
                min="0"
                inputMode="decimal"
                value={draft.maxPrice}
                placeholder="e.g. 50000"
                onChange={(event) => patch({ maxPrice: event.target.value })}
                aria-invalid={priceBackwards}
                className={CONTROL}
              />
            </Labelled>
          </div>
          {priceBackwards ? (
            <p className="text-xs text-destructive">Minimum price is above maximum.</p>
          ) : null}
        </Group>

        <DateRange
          label="Created between"
          fromId="product-created-from"
          toId="product-created-to"
          from={draft.createdFrom}
          to={draft.createdTo}
          invalid={createdBackwards}
          onChange={(next) => patch(next)}
          fromKey="createdFrom"
          toKey="createdTo"
        />

        <DateRange
          label="Updated between"
          fromId="product-updated-from"
          toId="product-updated-to"
          from={draft.updatedFrom}
          to={draft.updatedTo}
          invalid={updatedBackwards}
          onChange={(next) => patch(next)}
          fromKey="updatedFrom"
          toKey="updatedTo"
        />
      </div>

      <SheetFooter className="sticky bottom-0 gap-3 border-t bg-popover">
        {resultCount !== null && !dirty ? (
          <p className="text-center text-xs text-muted-foreground">
            Matching {resultCount} product{resultCount === 1 ? "" : "s"}
          </p>
        ) : null}
        <div className="flex flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClear}
            className="h-10 flex-1 cursor-pointer rounded-lg text-sm"
          >
            Clear all
          </Button>
          <Button
            type="button"
            onClick={() => (dirty ? onApply(draft) : onClose())}
            disabled={invalid}
            className="h-10 flex-1 cursor-pointer rounded-lg text-sm font-semibold"
          >
            {dirty ? "Apply filters" : "Done"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

function EnumSelect<T extends string>({
  label,
  value,
  allLabel,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T | "";
  allLabel: string;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T | "") => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select
        value={value || ALL}
        onValueChange={(next) => onChange(next === ALL ? "" : (next as T))}
      >
        <SelectTrigger
          aria-label={label}
          className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
        >
          <SelectValue>
            {(current) =>
              current === ALL ? allLabel : labels[current as T] ?? allLabel
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function SelectField<T>({
  label,
  value,
  options,
  allValue,
  allLabel,
  valueFor,
  labelFor,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly T[];
  allValue?: string;
  allLabel?: string;
  valueFor: (option: T) => string;
  labelFor: (option: T) => string;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => valueFor(option) === value);

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(next) => onChange(String(next))}>
        <SelectTrigger
          aria-label={label}
          className={cn(CONTROL, "data-[size=default]:h-10 w-full cursor-pointer")}
        >
          <SelectValue>
            {(current) =>
              current === allValue
                ? (allLabel ?? label)
                : selected
                  ? labelFor(selected)
                  : allLabel ?? label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allValue ? <SelectItem value={allValue}>{allLabel}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={valueFor(option)} value={valueFor(option)}>
              {labelFor(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function DateRange({
  label,
  fromId,
  toId,
  from,
  to,
  invalid,
  fromKey,
  toKey,
  onChange,
}: {
  label: string;
  fromId: string;
  toId: string;
  from: string;
  to: string;
  invalid: boolean;
  fromKey: "createdFrom" | "updatedFrom";
  toKey: "createdTo" | "updatedTo";
  onChange: (patch: Partial<ProductFilterState>) => void;
}) {
  return (
    <Group label={label}>
      <div className="grid grid-cols-2 gap-3">
        <Labelled label="From" htmlFor={fromId}>
          <Input
            id={fromId}
            type="date"
            value={from}
            onChange={(event) => onChange({ [fromKey]: event.target.value })}
            aria-invalid={invalid}
            className={cn(CONTROL, "cursor-pointer")}
          />
        </Labelled>
        <Labelled label="To" htmlFor={toId}>
          <Input
            id={toId}
            type="date"
            value={to}
            onChange={(event) => onChange({ [toKey]: event.target.value })}
            aria-invalid={invalid}
            className={cn(CONTROL, "cursor-pointer")}
          />
        </Labelled>
      </div>
      {invalid ? (
        <p className="text-xs text-destructive">The start date is after the end date.</p>
      ) : null}
    </Group>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {children}
    </section>
  );
}

function Labelled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function activeFilterCount(value: ProductFilterState) {
  return [
    value.categoryId,
    value.brandId,
    value.status,
    value.visibility,
    value.productType,
    value.stockStatus,
    value.featured !== "any" ? value.featured : "",
    value.minPrice,
    value.maxPrice,
    value.createdFrom,
    value.createdTo,
    value.updatedFrom,
    value.updatedTo,
    value.sort !== "newest" ? value.sort : "",
    value.limit !== "20" ? value.limit : "",
  ].filter(Boolean).length;
}
