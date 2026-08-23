"use client";

import { useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import {
  ATTRIBUTE_SOURCES,
  ATTRIBUTE_TYPES,
  CATALOG_STATUSES,
  type AdminAttribute,
  type AttributeSource,
  type AttributeType,
  type AttributeWritePayload,
  type CatalogStatus,
} from "@/lib/api/admin/attributes";
import {
  ATTRIBUTE_SOURCE_LABEL,
  ATTRIBUTE_TYPE_LABEL,
  CATALOG_STATUS_LABEL,
} from "./attribute-badges";
import { AuthInput } from "@/components/auth/controls";
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
import { Textarea } from "@/components/ui/textarea";

const slugSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(120, "Must be at most 120 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

const keySchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(80, "Must be at most 80 characters")
  .regex(/^[a-z][a-z0-9_]*$/, "Start with a letter. Use lowercase letters, numbers and underscores");

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || undefined);

const numberText = z
  .string()
  .trim()
  .refine((value) => value === "" || Number.isFinite(Number(value)), "Enter a valid number");

const attributeFormSchema = z
  .object({
    name: z.string().trim().min(1, "Required").max(120, "Must be at most 120 characters"),
    key: keySchema,
    slug: slugSchema,
    description: optionalText(2000),
    source: z.enum(ATTRIBUTE_SOURCES),
    type: z.enum(ATTRIBUTE_TYPES),
    status: z.enum(CATALOG_STATUSES),
    min: numberText,
    max: numberText,
    helpText: optionalText(500),
    placeholder: optionalText(120),
    showInProductDetails: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.type !== "range") return;

    if (!values.min) {
      context.addIssue({ code: "custom", path: ["min"], message: "Required for range attributes" });
    }
    if (!values.max) {
      context.addIssue({ code: "custom", path: ["max"], message: "Required for range attributes" });
    }
    if (values.min && values.max && Number(values.min) > Number(values.max)) {
      context.addIssue({ code: "custom", path: ["min"], message: "Min must not exceed max" });
    }
  });

type AttributeFormValues = z.input<typeof attributeFormSchema>;
type AttributeFormData = z.output<typeof attributeFormSchema>;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatSlugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-{2,}/g, "-");
}

function keyify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/g, "");
}

function formatKeyInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[^a-z]+/g, "");
}

function defaults(attribute?: AdminAttribute | null): AttributeFormValues {
  return {
    name: attribute?.name ?? "",
    key: attribute?.key ?? "",
    slug: attribute?.slug ?? "",
    description: attribute?.description ?? "",
    source: attribute?.source ?? "product",
    type: attribute?.type ?? "select",
    status: attribute?.status ?? "ACTIVE",
    min: attribute?.min == null ? "" : String(attribute.min),
    max: attribute?.max == null ? "" : String(attribute.max),
    helpText: attribute?.display?.helpText ?? "",
    placeholder: attribute?.display?.placeholder ?? "",
    showInProductDetails: attribute?.display?.showInProductDetails ?? true,
  };
}

function payload(values: AttributeFormData): AttributeWritePayload {
  return {
    name: values.name,
    key: values.key,
    slug: values.slug,
    ...(values.description ? { description: values.description } : {}),
    source: values.source,
    type: values.type,
    status: values.status,
    ...(values.type === "range"
      ? { min: Number(values.min), max: Number(values.max) }
      : {}),
    display: {
      ...(values.helpText ? { helpText: values.helpText } : {}),
      ...(values.placeholder ? { placeholder: values.placeholder } : {}),
      showInProductDetails: values.showInProductDetails,
    },
  };
}

export function AttributeFormDialog({
  open,
  attribute,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  attribute: AdminAttribute | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (body: AttributeWritePayload) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        {open ? (
          <AttributeFormBody
            key={attribute?.id ?? "new"}
            attribute={attribute}
            saving={saving}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AttributeFormBody({
  attribute,
  saving,
  onClose,
  onSave,
}: {
  attribute: AdminAttribute | null;
  saving: boolean;
  onClose: () => void;
  onSave: (body: AttributeWritePayload) => void;
}) {
  const form = useForm<AttributeFormValues, unknown, AttributeFormData>({
    resolver: zodResolver(attributeFormSchema),
    defaultValues: defaults(attribute),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = form;
  const name = useWatch({ control, name: "name" }) ?? "";
  const key = useWatch({ control, name: "key" }) ?? "";
  const slug = useWatch({ control, name: "slug" }) ?? "";
  const source = useWatch({ control, name: "source" }) ?? "product";
  const type = useWatch({ control, name: "type" }) ?? "select";
  const status = useWatch({ control, name: "status" }) ?? "ACTIVE";
  const showInProductDetails =
    useWatch({ control, name: "showInProductDetails" }) ?? true;
  const keyField = register("key");
  const slugField = register("slug");
  const previousGeneratedKey = useRef(keyify(defaults(attribute).name));
  const previousGeneratedSlug = useRef(slugify(defaults(attribute).name));

  useEffect(() => {
    if (attribute) return;

    const nextKey = keyify(name);
    if ((!key || key === previousGeneratedKey.current) && key !== nextKey) {
      setValue("key", nextKey, { shouldDirty: true, shouldValidate: true });
    }
    previousGeneratedKey.current = nextKey;

    const nextSlug = slugify(name);
    if ((!slug || slug === previousGeneratedSlug.current) && slug !== nextSlug) {
      setValue("slug", nextSlug, { shouldDirty: true, shouldValidate: true });
    }
    previousGeneratedSlug.current = nextSlug;
  }, [attribute, key, name, setValue, slug]);

  useEffect(() => {
    if (type === "range") return;
    setValue("min", "", { shouldDirty: true, shouldValidate: true });
    setValue("max", "", { shouldDirty: true, shouldValidate: true });
  }, [setValue, type]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{attribute ? "Edit attribute" : "Create attribute"}</DialogTitle>
        <DialogDescription>
          Attributes define reusable product metadata, filters and variant options.
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={handleSubmit((values) => onSave(payload(values)))}
        noValidate
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="-mr-1 min-h-0 overflow-y-auto pr-3 pl-1 [scrollbar-gutter:stable]">
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="attribute-name">Name</FieldLabel>
              <AuthInput
                id="attribute-name"
                placeholder="e.g. Screen size"
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.key)}>
                <FieldLabel htmlFor="attribute-key">Key</FieldLabel>
                <AuthInput
                  id="attribute-key"
                  placeholder="e.g. screen_size"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.key)}
                  {...keyField}
                  onChange={(event) => {
                    event.target.value = formatKeyInput(event.target.value);
                    void keyField.onChange(event);
                  }}
                />
                <FieldDescription>Used by filters and product attributes.</FieldDescription>
                <FieldError errors={[errors.key]} />
              </Field>

              <Field data-invalid={Boolean(errors.slug)}>
                <FieldLabel htmlFor="attribute-slug">Slug</FieldLabel>
                <AuthInput
                  id="attribute-slug"
                  placeholder="e.g. screen-size"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.slug)}
                  {...slugField}
                  onChange={(event) => {
                    event.target.value = formatSlugInput(event.target.value);
                    void slugField.onChange(event);
                  }}
                />
                <FieldDescription>Lowercase URL slug.</FieldDescription>
                <FieldError errors={[errors.slug]} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField
                id="attribute-source"
                label="Source"
                value={source}
                options={ATTRIBUTE_SOURCES}
                labels={ATTRIBUTE_SOURCE_LABEL}
                onChange={(next) =>
                  setValue("source", next as AttributeSource, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
              <SelectField
                id="attribute-type"
                label="Type"
                value={type}
                options={ATTRIBUTE_TYPES}
                labels={ATTRIBUTE_TYPE_LABEL}
                onChange={(next) =>
                  setValue("type", next as AttributeType, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
              <SelectField
                id="attribute-status"
                label="Status"
                value={status}
                options={CATALOG_STATUSES}
                labels={CATALOG_STATUS_LABEL}
                onChange={(next) =>
                  setValue("status", next as CatalogStatus, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </div>

            {type === "range" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.min)}>
                  <FieldLabel htmlFor="attribute-min">Minimum</FieldLabel>
                  <AuthInput
                    id="attribute-min"
                    type="number"
                    step="any"
                    placeholder="e.g. 0"
                    aria-invalid={Boolean(errors.min)}
                    {...register("min")}
                  />
                  <FieldError errors={[errors.min]} />
                </Field>
                <Field data-invalid={Boolean(errors.max)}>
                  <FieldLabel htmlFor="attribute-max">Maximum</FieldLabel>
                  <AuthInput
                    id="attribute-max"
                    type="number"
                    step="any"
                    placeholder="e.g. 100"
                    aria-invalid={Boolean(errors.max)}
                    {...register("max")}
                  />
                  <FieldError errors={[errors.max]} />
                </Field>
              </div>
            ) : null}

            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="attribute-description">Description</FieldLabel>
              <Textarea
                id="attribute-description"
                placeholder="e.g. Customer-facing notes about how this value should be used."
                className="min-h-24 rounded-field text-base md:text-sm"
                aria-invalid={Boolean(errors.description)}
                {...register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.placeholder)}>
                <FieldLabel htmlFor="attribute-placeholder">Input placeholder</FieldLabel>
                <AuthInput
                  id="attribute-placeholder"
                  placeholder="e.g. Choose a screen size"
                  aria-invalid={Boolean(errors.placeholder)}
                  {...register("placeholder")}
                />
                <FieldError errors={[errors.placeholder]} />
              </Field>
              <Field data-invalid={Boolean(errors.helpText)}>
                <FieldLabel htmlFor="attribute-help">Help text</FieldLabel>
                <AuthInput
                  id="attribute-help"
                  placeholder="e.g. Select the diagonal display measurement."
                  aria-invalid={Boolean(errors.helpText)}
                  {...register("helpText")}
                />
                <FieldError errors={[errors.helpText]} />
              </Field>
            </div>

            <label htmlFor="attribute-show-details" className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-medium">
              <Checkbox
                id="attribute-show-details"
                checked={showInProductDetails}
                onCheckedChange={(next) =>
                  setValue("showInProductDetails", next === true, {
                    shouldDirty: true,
                  })
                }
              />
              Show in product details
            </label>
          </FieldGroup>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 cursor-pointer rounded-field">
            Close
          </Button>
          <Button type="submit" disabled={saving} className="h-11 cursor-pointer gap-2 rounded-field font-semibold">
            {saving ? <Spinner /> : null}
            {saving ? "Saving..." : attribute ? "Save attribute" : "Create attribute"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="h-12 w-full cursor-pointer rounded-field text-base data-[size=default]:h-12 md:text-sm">
          <SelectValue>{(current) => labels[current as T]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function DeleteAttributeDialog({
  attribute,
  onClose,
  onConfirm,
}: {
  attribute: AdminAttribute | null;
  onClose: () => void;
  onConfirm: (attribute: AdminAttribute) => void;
}) {
  return (
    <AlertDialog open={attribute !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {attribute?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The attribute is marked archived and removed from active catalog
            configuration. Existing products keep their stored values.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => attribute && onConfirm(attribute)}
            className="cursor-pointer rounded-lg bg-destructive text-white hover:bg-destructive/90"
          >
            Archive attribute
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
