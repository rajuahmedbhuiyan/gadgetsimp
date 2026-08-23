"use client";

import { useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { ImageOff, Loader2, Upload, X } from "lucide-react";

import {
  PRODUCT_STATUSES,
  STOCK_STATUSES,
  type AdminVariation,
  type ProductStatus,
  type StockStatus,
  type VariationPatchPayload,
} from "@/lib/api/admin/variations";
import {
  PRODUCT_STATUS_LABEL,
  STOCK_STATUS_LABEL,
} from "./variation-badges";
import { AuthInput } from "@/components/auth/controls";
import { checkImage, IMAGE_ACCEPT, mediaApi } from "@/lib/api/media";
import { errorMessage } from "@/lib/auth/errors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || undefined);
const numberText = z
  .string()
  .trim()
  .refine((value) => value === "" || Number(value) >= 0, "Use zero or more");
const intText = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d+$/.test(value), "Use a whole number");

const formSchema = z
  .object({
    sku: z.string().trim().min(1, "Required").max(120, "Must be at most 120 characters"),
    barcode: optionalText(120),
    sellingPrice: numberText,
    originalPrice: numberText,
    quantity: intText,
    trackInventory: z.boolean(),
    allowBackorder: z.boolean(),
    lowStockThreshold: intText,
    stockStatus: z.enum(STOCK_STATUSES),
    status: z.enum(PRODUCT_STATUSES),
    imageSrc: optionalText(1024),
    imageAlt: optionalText(180),
    sortOrder: intText,
  })
  .refine(
    (values) =>
      !values.originalPrice ||
      !values.sellingPrice ||
      Number(values.originalPrice) >= Number(values.sellingPrice),
    { message: "Original price must not be less than selling price", path: ["originalPrice"] },
  );

type VariationFormValues = z.input<typeof formSchema>;
type VariationFormData = z.output<typeof formSchema>;

function defaults(variation: AdminVariation): VariationFormValues {
  return {
    sku: variation.sku ?? "",
    barcode: variation.barcode ?? "",
    sellingPrice: variation.sellingPrice == null ? "" : String(variation.sellingPrice),
    originalPrice: variation.originalPrice == null ? "" : String(variation.originalPrice),
    quantity: variation.stock?.quantity == null ? "" : String(variation.stock.quantity),
    trackInventory: variation.stock?.trackInventory ?? true,
    allowBackorder: variation.stock?.allowBackorder ?? false,
    lowStockThreshold:
      variation.stock?.lowStockThreshold == null
        ? ""
        : String(variation.stock.lowStockThreshold),
    stockStatus: variation.stock?.status ?? "IN_STOCK",
    status: variation.status ?? "ACTIVE",
    imageSrc: variation.image?.src ?? "",
    imageAlt: variation.image?.alt ?? "",
    sortOrder: variation.sortOrder == null ? "0" : String(variation.sortOrder),
  };
}

function payload(values: VariationFormData): VariationPatchPayload {
  return {
    sku: values.sku,
    barcode: values.barcode ?? "",
    sellingPrice: values.sellingPrice ? Number(values.sellingPrice) : 0,
    ...(values.originalPrice ? { originalPrice: Number(values.originalPrice) } : {}),
    stock: {
      ...(values.quantity ? { quantity: Number(values.quantity) } : {}),
      trackInventory: values.trackInventory,
      allowBackorder: values.allowBackorder,
      ...(values.lowStockThreshold ? { lowStockThreshold: Number(values.lowStockThreshold) } : {}),
      status: values.stockStatus,
    },
    status: values.status,
    ...(values.imageSrc
      ? { image: { src: values.imageSrc, alt: values.imageAlt ?? "" } }
      : {}),
    sortOrder: values.sortOrder ? Number(values.sortOrder) : 0,
  };
}

export function VariationFormDialog({
  open,
  variation,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  variation: AdminVariation | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (body: VariationPatchPayload) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        {open && variation ? (
          <VariationFormBody
            key={variation.id}
            variation={variation}
            saving={saving}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function VariationFormBody({
  variation,
  saving,
  onClose,
  onSave,
}: {
  variation: AdminVariation;
  saving: boolean;
  onClose: () => void;
  onSave: (body: VariationPatchPayload) => void;
}) {
  const { control, register, handleSubmit, setValue, formState: { errors } } =
    useForm<VariationFormValues, unknown, VariationFormData>({
      resolver: zodResolver(formSchema),
      defaultValues: defaults(variation),
      mode: "onSubmit",
      reValidateMode: "onChange",
    });
  const status = useWatch({ control, name: "status" }) ?? "ACTIVE";
  const stockStatus = useWatch({ control, name: "stockStatus" }) ?? "IN_STOCK";
  const trackInventory = useWatch({ control, name: "trackInventory" }) ?? true;
  const allowBackorder = useWatch({ control, name: "allowBackorder" }) ?? false;
  const imageSrc = useWatch({ control, name: "imageSrc" }) ?? "";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit variation</DialogTitle>
        <DialogDescription>
          Update price, stock, lifecycle and media for {variation.sku}.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit((values) => onSave(payload(values)))} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="-mr-1 min-h-0 overflow-y-auto pr-3 [scrollbar-gutter:stable]">
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.sku)}>
                <FieldLabel htmlFor="variation-sku">SKU</FieldLabel>
                <AuthInput id="variation-sku" placeholder="e.g. IP15-BLK-128" autoFocus aria-invalid={Boolean(errors.sku)} {...register("sku")} />
                <FieldError errors={[errors.sku]} />
              </Field>
              <Field data-invalid={Boolean(errors.barcode)}>
                <FieldLabel htmlFor="variation-barcode">Barcode</FieldLabel>
                <AuthInput id="variation-barcode" placeholder="e.g. 0123456789012" aria-invalid={Boolean(errors.barcode)} {...register("barcode")} />
                <FieldError errors={[errors.barcode]} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field data-invalid={Boolean(errors.sellingPrice)}>
                <FieldLabel htmlFor="variation-selling">Selling price</FieldLabel>
                <AuthInput id="variation-selling" inputMode="decimal" placeholder="e.g. 89900" aria-invalid={Boolean(errors.sellingPrice)} {...register("sellingPrice")} />
                <FieldError errors={[errors.sellingPrice]} />
              </Field>
              <Field data-invalid={Boolean(errors.originalPrice)}>
                <FieldLabel htmlFor="variation-original">Original price</FieldLabel>
                <AuthInput id="variation-original" inputMode="decimal" placeholder="e.g. 94900" aria-invalid={Boolean(errors.originalPrice)} {...register("originalPrice")} />
                <FieldError errors={[errors.originalPrice]} />
              </Field>
              <Field data-invalid={Boolean(errors.sortOrder)}>
                <FieldLabel htmlFor="variation-sort">Sort order</FieldLabel>
                <AuthInput id="variation-sort" inputMode="numeric" placeholder="e.g. 0" aria-invalid={Boolean(errors.sortOrder)} {...register("sortOrder")} />
                <FieldError errors={[errors.sortOrder]} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField id="variation-status" label="Variation status" value={status} options={PRODUCT_STATUSES} labels={PRODUCT_STATUS_LABEL} onChange={(next) => setValue("status", next as ProductStatus, { shouldDirty: true, shouldValidate: true })} />
              <SelectField id="variation-stock-status" label="Stock status" value={stockStatus} options={STOCK_STATUSES} labels={STOCK_STATUS_LABEL} onChange={(next) => setValue("stockStatus", next as StockStatus, { shouldDirty: true, shouldValidate: true })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field data-invalid={Boolean(errors.quantity)}>
                <FieldLabel htmlFor="variation-quantity">Quantity</FieldLabel>
                <AuthInput id="variation-quantity" inputMode="numeric" placeholder="e.g. 25" aria-invalid={Boolean(errors.quantity)} {...register("quantity")} />
                <FieldError errors={[errors.quantity]} />
              </Field>
              <Field data-invalid={Boolean(errors.lowStockThreshold)}>
                <FieldLabel htmlFor="variation-low-stock">Low stock at</FieldLabel>
                <AuthInput id="variation-low-stock" inputMode="numeric" placeholder="e.g. 5" aria-invalid={Boolean(errors.lowStockThreshold)} {...register("lowStockThreshold")} />
                <FieldError errors={[errors.lowStockThreshold]} />
              </Field>
              <div className="grid gap-2">
                <Toggle id="variation-track" label="Track inventory" checked={trackInventory} onChange={(checked) => setValue("trackInventory", checked, { shouldDirty: true })} />
                <Toggle id="variation-backorder" label="Allow backorder" checked={allowBackorder} onChange={(checked) => setValue("allowBackorder", checked, { shouldDirty: true })} />
              </div>
            </div>

            <ImageField
              value={imageSrc}
              error={errors.imageSrc}
              register={register("imageSrc")}
              onChange={(value) => setValue("imageSrc", value, { shouldDirty: true, shouldValidate: true })}
            />
            <Field data-invalid={Boolean(errors.imageAlt)}>
              <FieldLabel htmlFor="variation-image-alt">Image alt text</FieldLabel>
              <AuthInput id="variation-image-alt" placeholder="e.g. iPhone 15 in black" aria-invalid={Boolean(errors.imageAlt)} {...register("imageAlt")} />
              <FieldError errors={[errors.imageAlt]} />
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 cursor-pointer rounded-field">Close</Button>
          <Button type="submit" disabled={saving} className="h-11 cursor-pointer gap-2 rounded-field font-semibold">
            {saving ? <Spinner /> : null}
            {saving ? "Saving..." : "Save variation"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function SelectField<T extends string>({ id, label, value, options, labels, onChange }: { id: string; label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (value: T) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="h-12 w-full cursor-pointer rounded-field text-base data-[size=default]:h-12 md:text-sm">
          <SelectValue>{(current) => labels[current as T]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option} value={option}>{labels[option]}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex h-12 cursor-pointer items-center gap-2 rounded-field border px-3 text-sm font-medium">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      {label}
    </label>
  );
}

function ImageField({ value, error, register, onChange }: { value: string; error?: { message?: string }; register: UseFormRegisterReturn<"imageSrc">; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { onChange: onImageInputChange, ...imageInput } = register;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    const rejected = checkImage(file);
    if (rejected) {
      setUploadError(rejected);
      return;
    }
    setUploadError(null);
    setBusy(true);
    try {
      const { data } = await mediaApi.upload(file, "variation");
      onChange(data.media.url);
    } catch (uploadProblem) {
      setUploadError(errorMessage(uploadProblem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field data-invalid={Boolean(error || uploadError)}>
      <FieldLabel htmlFor="variation-image">Image</FieldLabel>
      <div className="flex gap-3">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} aria-label="Upload variation image" className="relative flex size-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-field border bg-muted/30 text-muted-foreground transition-colors hover:border-brand/50 disabled:pointer-events-none disabled:opacity-60">
          {value ? <span aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(\"${value}\")` }} /> : <ImageOff className="size-4" aria-hidden />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity hover:opacity-100 [@media(hover:none)]:opacity-100">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="relative">
            <AuthInput id="variation-image" placeholder="Upload an image or paste e.g. https://cdn.example.com/variant.webp" aria-invalid={Boolean(error || uploadError)} className={value ? "pr-14" : undefined} value={value} {...imageInput} onChange={(event) => { setUploadError(null); void onImageInputChange(event); }} />
            {value ? (
              <button type="button" onClick={() => { setUploadError(null); onChange(""); }} className="absolute right-1.5 top-1/2 z-10 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg bg-background/95 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground" aria-label="Clear variation image">
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} className="sr-only" disabled={busy} onChange={onPick} aria-label="Choose variation image file" />
        </div>
      </div>
      <FieldDescription>JPEG, PNG, WebP, GIF or AVIF up to 3MB, or paste an image URL.</FieldDescription>
      {uploadError ? <FieldError>{uploadError}</FieldError> : <FieldError errors={[error]} />}
    </Field>
  );
}

export function DeleteVariationDialog({ variation, onClose, onConfirm }: { variation: AdminVariation | null; onClose: () => void; onConfirm: (variation: AdminVariation) => void }) {
  return (
    <AlertDialog open={variation !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {variation?.sku}?</AlertDialogTitle>
          <AlertDialogDescription>
            This soft-deletes the variation so it no longer appears in product or variation queries.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => variation && onConfirm(variation)} className="cursor-pointer rounded-lg bg-destructive text-white hover:bg-destructive/90">
            Delete variation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
