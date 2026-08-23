"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Home, ImageOff, Loader2, Upload, X } from "lucide-react";

import {
  CATALOG_STATUSES,
  CATALOG_VISIBILITIES,
  type AdminCategory,
  type CategoryNode,
  type CategoryWritePayload,
  type CatalogStatus,
  type CatalogVisibility,
} from "@/lib/api/admin/categories";
import type { AdminAttribute } from "@/lib/api/admin/attributes";
import {
  CATALOG_STATUS_LABEL,
  VISIBILITY_LABEL,
} from "@/components/panel/brands/brand-badges";
import { AuthInput } from "@/components/auth/controls";
import { checkImage, IMAGE_ACCEPT, mediaApi } from "@/lib/api/media";
import { errorMessage } from "@/lib/auth/errors";
import { siteConfig } from "@/lib/config/site";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

const ROOT = "__root";

const slugSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(180, "Must be at most 180 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");
const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || undefined);
const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "Enter a valid URL")
  .transform((value) => value || undefined);

const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Required").max(160, "Must be at most 160 characters"),
  slug: slugSchema,
  description: optionalText(10_000),
  parentId: z.string(),
  status: z.enum(CATALOG_STATUSES),
  visibility: z.enum(CATALOG_VISIBILITIES),
  image: optionalText(1024),
  attributes: z.array(z.string()).max(100),
  sortOrder: z.string().trim().refine((value) => value === "" || /^\d+$/.test(value), "Use a whole number"),
  showInHome: z.boolean(),
  seoTitle: optionalText(70),
  seoDescription: optionalText(320),
  seoKeywords: z
    .string()
    .trim()
    .transform((value) =>
      value
        ? value.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
    )
    .refine((items) => items.length <= 30, "Use 30 keywords or fewer"),
  canonicalUrl: optionalUrl,
  noIndex: z.boolean(),
  noFollow: z.boolean(),
  ogTitle: optionalText(95),
  ogDescription: optionalText(300),
  ogImage: optionalUrl,
  twitterTitle: optionalText(70),
  twitterDescription: optionalText(200),
  twitterImage: optionalUrl,
});

type CategoryFormValues = z.input<typeof categoryFormSchema>;
type CategoryFormData = z.output<typeof categoryFormSchema>;

interface ParentOption {
  id: string;
  label: string;
}

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

function flattenParents(nodes: CategoryNode[], editingId?: string, trail: string[] = []): ParentOption[] {
  const result: ParentOption[] = [];

  for (const node of nodes) {
    if (node.id === editingId) continue;
    const label = [...trail, node.name].join(" / ");
    result.push({ id: node.id, label });
    result.push(...flattenParents(node.children ?? [], editingId, [...trail, node.name]));
  }

  return result;
}

function seoTitle(name: string) {
  return name.trim() ? `${name.trim()} | ${siteConfig.name}` : "";
}

function seoDescription(name: string, description: string | undefined) {
  if (description?.trim()) return description.trim().slice(0, 320);
  return name.trim() ? `Shop ${name.trim()} products at ${siteConfig.name}.` : "";
}

function canonical(slug: string) {
  return slug.trim()
    ? `${siteConfig.url.replace(/\/$/, "")}/shop/${slug.trim()}`
    : "";
}

function keywords(name: string) {
  const base = name.trim().toLowerCase();
  return base ? `${base}, ${base} products` : "";
}

function defaults(category?: AdminCategory | null): CategoryFormValues {
  return {
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    description: category?.description ?? "",
    parentId: category?.parentId?.id ?? ROOT,
    status: category?.status ?? "DRAFT",
    visibility: category?.visibility ?? "PUBLIC",
    image: category?.image ?? "",
    attributes: category?.attributes?.map((attribute) => attribute.id) ?? [],
    sortOrder: category?.sortOrder == null ? "0" : String(category.sortOrder),
    showInHome: category?.showInHome ?? false,
    seoTitle: category?.seo?.title ?? "",
    seoDescription: category?.seo?.description ?? "",
    seoKeywords: category?.seo?.keywords?.join(", ") ?? "",
    canonicalUrl: category?.seo?.canonicalUrl ?? "",
    noIndex: category?.seo?.noIndex ?? false,
    noFollow: category?.seo?.noFollow ?? false,
    ogTitle: category?.seo?.ogTitle ?? "",
    ogDescription: category?.seo?.ogDescription ?? "",
    ogImage: category?.seo?.ogImage ?? "",
    twitterTitle: category?.seo?.twitterTitle ?? "",
    twitterDescription: category?.seo?.twitterDescription ?? "",
    twitterImage: category?.seo?.twitterImage ?? "",
  };
}

function payload(values: CategoryFormData): CategoryWritePayload {
  return {
    name: values.name,
    slug: values.slug,
    ...(values.description ? { description: values.description } : {}),
    parentId: values.parentId === ROOT ? null : values.parentId,
    status: values.status,
    visibility: values.visibility,
    ...(values.image ? { image: values.image } : {}),
    attributes: values.attributes,
    sortOrder: values.sortOrder ? Number(values.sortOrder) : 0,
    showInHome: values.showInHome,
    seo: {
      title: values.seoTitle,
      description: values.seoDescription,
      keywords: values.seoKeywords,
      canonicalUrl: values.canonicalUrl,
      noIndex: values.noIndex,
      noFollow: values.noFollow,
      ogTitle: values.ogTitle,
      ogDescription: values.ogDescription,
      ogImage: values.ogImage,
      twitterTitle: values.twitterTitle,
      twitterDescription: values.twitterDescription,
      twitterImage: values.twitterImage,
    },
  };
}

export function CategoryFormDialog({
  open,
  category,
  tree,
  attributes,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  category: AdminCategory | null;
  tree: CategoryNode[];
  attributes: AdminAttribute[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (body: CategoryWritePayload) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        {open ? (
          <CategoryFormBody
            key={category?.id ?? "new"}
            category={category}
            tree={tree}
            attributes={attributes}
            saving={saving}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CategoryFormBody({
  category,
  tree,
  attributes,
  saving,
  onClose,
  onSave,
}: {
  category: AdminCategory | null;
  tree: CategoryNode[];
  attributes: AdminAttribute[];
  saving: boolean;
  onClose: () => void;
  onSave: (body: CategoryWritePayload) => void;
}) {
  const form = useForm<CategoryFormValues, unknown, CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: defaults(category),
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const { control, register, handleSubmit, setValue, formState: { errors } } = form;
  const name = useWatch({ control, name: "name" }) ?? "";
  const slug = useWatch({ control, name: "slug" }) ?? "";
  const description = useWatch({ control, name: "description" }) ?? "";
  const parentId = useWatch({ control, name: "parentId" }) || ROOT;
  const status = useWatch({ control, name: "status" }) ?? "DRAFT";
  const visibility = useWatch({ control, name: "visibility" }) ?? "PUBLIC";
  const image = useWatch({ control, name: "image" }) ?? "";
  const selectedAttributes = useWatch({ control, name: "attributes" }) ?? [];
  const showInHome = useWatch({ control, name: "showInHome" }) ?? false;
  const noIndex = useWatch({ control, name: "noIndex" }) ?? false;
  const noFollow = useWatch({ control, name: "noFollow" }) ?? false;
  const seoTitleValue = useWatch({ control, name: "seoTitle" }) ?? "";
  const seoDescriptionValue = useWatch({ control, name: "seoDescription" }) ?? "";
  const seoKeywordsValue = useWatch({ control, name: "seoKeywords" }) ?? "";
  const canonicalUrl = useWatch({ control, name: "canonicalUrl" }) ?? "";
  const ogTitle = useWatch({ control, name: "ogTitle" }) ?? "";
  const ogDescription = useWatch({ control, name: "ogDescription" }) ?? "";
  const ogImage = useWatch({ control, name: "ogImage" }) ?? "";
  const twitterTitle = useWatch({ control, name: "twitterTitle" }) ?? "";
  const twitterDescription = useWatch({ control, name: "twitterDescription" }) ?? "";
  const twitterImage = useWatch({ control, name: "twitterImage" }) ?? "";
  const slugField = register("slug");
  const previousGeneratedSlug = useRef(slugify(defaults(category).name));
  const previousSeo = useRef({
    title: defaults(category).seoTitle,
    description: defaults(category).seoDescription,
    keywords: defaults(category).seoKeywords,
    canonicalUrl: defaults(category).canonicalUrl,
    ogTitle: defaults(category).ogTitle,
    ogDescription: defaults(category).ogDescription,
    ogImage: defaults(category).ogImage,
    twitterTitle: defaults(category).twitterTitle,
    twitterDescription: defaults(category).twitterDescription,
    twitterImage: defaults(category).twitterImage,
  });
  const parentOptions = flattenParents(tree, category?.id);

  useEffect(() => {
    if (category) return;
    const nextSlug = slugify(name);
    if ((!slug || slug === previousGeneratedSlug.current) && slug !== nextSlug) {
      setValue("slug", nextSlug, { shouldDirty: true, shouldValidate: true });
    }
    previousGeneratedSlug.current = nextSlug;
  }, [category, name, setValue, slug]);

  useEffect(() => {
    const next = {
      title: seoTitle(name),
      description: seoDescription(name, description),
      keywords: keywords(name),
      canonicalUrl: canonical(slug),
      ogTitle: seoTitle(name),
      ogDescription: seoDescription(name, description),
      ogImage: image,
      twitterTitle: seoTitle(name),
      twitterDescription: seoDescription(name, description),
      twitterImage: image,
    };

    if ((!seoTitleValue || seoTitleValue === previousSeo.current.title) && seoTitleValue !== next.title) setValue("seoTitle", next.title, { shouldDirty: true });
    if ((!seoDescriptionValue || seoDescriptionValue === previousSeo.current.description) && seoDescriptionValue !== next.description) setValue("seoDescription", next.description, { shouldDirty: true });
    if ((!seoKeywordsValue || seoKeywordsValue === previousSeo.current.keywords) && seoKeywordsValue !== next.keywords) setValue("seoKeywords", next.keywords, { shouldDirty: true });
    if ((!canonicalUrl || canonicalUrl === previousSeo.current.canonicalUrl) && canonicalUrl !== next.canonicalUrl) setValue("canonicalUrl", next.canonicalUrl, { shouldDirty: true });
    if ((!ogTitle || ogTitle === previousSeo.current.ogTitle) && ogTitle !== next.ogTitle) setValue("ogTitle", next.ogTitle, { shouldDirty: true });
    if ((!ogDescription || ogDescription === previousSeo.current.ogDescription) && ogDescription !== next.ogDescription) setValue("ogDescription", next.ogDescription, { shouldDirty: true });
    if ((!ogImage || ogImage === previousSeo.current.ogImage) && ogImage !== next.ogImage) setValue("ogImage", next.ogImage, { shouldDirty: true });
    if ((!twitterTitle || twitterTitle === previousSeo.current.twitterTitle) && twitterTitle !== next.twitterTitle) setValue("twitterTitle", next.twitterTitle, { shouldDirty: true });
    if ((!twitterDescription || twitterDescription === previousSeo.current.twitterDescription) && twitterDescription !== next.twitterDescription) setValue("twitterDescription", next.twitterDescription, { shouldDirty: true });
    if ((!twitterImage || twitterImage === previousSeo.current.twitterImage) && twitterImage !== next.twitterImage) setValue("twitterImage", next.twitterImage, { shouldDirty: true });
    previousSeo.current = next;
  }, [canonicalUrl, description, image, name, ogDescription, ogImage, ogTitle, seoDescriptionValue, seoKeywordsValue, seoTitleValue, setValue, slug, twitterDescription, twitterImage, twitterTitle]);

  const toggleAttribute = (id: string, checked: boolean) => {
    const next = checked
      ? [...selectedAttributes, id]
      : selectedAttributes.filter((value) => value !== id);
    setValue("attributes", next, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{category ? "Edit category" : "Create category"}</DialogTitle>
        <DialogDescription>
          Categories organize storefront navigation, product filters and home curation.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit((values) => onSave(payload(values)))} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="-mr-1 min-h-0 overflow-y-auto pr-3 pl-1 [scrollbar-gutter:stable]">
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="category-name">Name</FieldLabel>
              <AuthInput id="category-name" placeholder="e.g. Smartphones" autoFocus aria-invalid={Boolean(errors.name)} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.slug)}>
                <FieldLabel htmlFor="category-slug">Slug</FieldLabel>
                <AuthInput
                  id="category-slug"
                  placeholder="e.g. smartphones"
                  aria-invalid={Boolean(errors.slug)}
                  {...slugField}
                  onChange={(event) => {
                    event.target.value = formatSlugInput(event.target.value);
                    void slugField.onChange(event);
                  }}
                />
                <FieldError errors={[errors.slug]} />
              </Field>
              <Field data-invalid={Boolean(errors.parentId)}>
                <FieldLabel htmlFor="category-parent">Parent</FieldLabel>
                <Select value={parentId} onValueChange={(next) => setValue("parentId", next ?? ROOT, { shouldDirty: true, shouldValidate: true })}>
                  <SelectTrigger id="category-parent" className="h-12 w-full cursor-pointer rounded-field text-base data-[size=default]:h-12 md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ROOT}>Root category</SelectItem>
                    {parentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[errors.parentId]} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField id="category-status" label="Status" value={status} options={CATALOG_STATUSES} labels={CATALOG_STATUS_LABEL} onChange={(next) => setValue("status", next as CatalogStatus, { shouldDirty: true, shouldValidate: true })} />
              <SelectField id="category-visibility" label="Visibility" value={visibility} options={CATALOG_VISIBILITIES} labels={VISIBILITY_LABEL} onChange={(next) => setValue("visibility", next as CatalogVisibility, { shouldDirty: true, shouldValidate: true })} />
              <Field data-invalid={Boolean(errors.sortOrder)}>
                <FieldLabel htmlFor="category-sort">Sort order</FieldLabel>
                <AuthInput id="category-sort" inputMode="numeric" placeholder="e.g. 0" aria-invalid={Boolean(errors.sortOrder)} {...register("sortOrder")} />
                <FieldError errors={[errors.sortOrder]} />
              </Field>
            </div>

            <label htmlFor="category-home" className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-medium">
              <Checkbox id="category-home" checked={showInHome} onCheckedChange={(next) => setValue("showInHome", next === true, { shouldDirty: true })} />
              <Home className="size-4 text-muted-foreground" aria-hidden />
              Show in home curation
            </label>

            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="category-description">Description</FieldLabel>
              <Textarea id="category-description" placeholder="e.g. Phones, cases, chargers and daily mobile essentials." className="min-h-24 rounded-field text-base md:text-sm" aria-invalid={Boolean(errors.description)} {...register("description")} />
              <FieldError errors={[errors.description]} />
            </Field>

            <ImageField value={image} error={errors.image} register={register("image")} onChange={(value) => setValue("image", value, { shouldDirty: true, shouldValidate: true })} />

            <Field data-invalid={Boolean(errors.attributes)}>
              <FieldLabel>Attributes</FieldLabel>
              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border p-2 [scrollbar-gutter:stable] sm:grid-cols-2">
                {attributes.length === 0 ? (
                  <p className="col-span-full px-2 py-3 text-sm text-muted-foreground">
                    No active attributes available.
                  </p>
                ) : (
                  attributes.map((attribute) => (
                    <label key={attribute.id} htmlFor={`category-attribute-${attribute.id}`} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-muted">
                      <Checkbox id={`category-attribute-${attribute.id}`} checked={selectedAttributes.includes(attribute.id)} onCheckedChange={(next) => toggleAttribute(attribute.id, next === true)} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{attribute.name}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">{attribute.key}</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <FieldDescription>Only active attributes can be assigned by the backend.</FieldDescription>
              <FieldError errors={[errors.attributes]} />
            </Field>

            <Accordion defaultValue={[]} className="rounded-lg border">
              <AccordionItem value="seo" className="border-b-0">
                <AccordionTrigger className="cursor-pointer px-3 py-3 hover:no-underline">
                  <span className="grid gap-0.5 text-left">
                    <span className="font-heading text-sm font-bold tracking-tight">SEO</span>
                    <span className="text-xs font-normal text-muted-foreground">Auto-filled from category details.</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="grid gap-3 px-3">
                  <Field data-invalid={Boolean(errors.seoTitle)}>
                    <FieldLabel htmlFor="category-seo-title">Title</FieldLabel>
                    <AuthInput id="category-seo-title" placeholder="e.g. Smartphones | GadgetSimp" {...register("seoTitle")} />
                    <FieldError errors={[errors.seoTitle]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.seoDescription)}>
                    <FieldLabel htmlFor="category-seo-description">Description</FieldLabel>
                    <Textarea id="category-seo-description" placeholder="e.g. Shop smartphones and mobile accessories online." className="min-h-20 rounded-field text-base md:text-sm" {...register("seoDescription")} />
                    <FieldError errors={[errors.seoDescription]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.seoKeywords)}>
                    <FieldLabel htmlFor="category-seo-keywords">Keywords</FieldLabel>
                    <AuthInput id="category-seo-keywords" placeholder="e.g. smartphones, mobile phones, phone accessories" {...register("seoKeywords")} />
                    <FieldError errors={[errors.seoKeywords]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.canonicalUrl)}>
                    <FieldLabel htmlFor="category-canonical">Canonical URL</FieldLabel>
                    <AuthInput id="category-canonical" type="url" placeholder="e.g. https://gadgetsimp.dev/shop/smartphones" {...register("canonicalUrl")} />
                    <FieldError errors={[errors.canonicalUrl]} />
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SeoToggle id="category-noindex" checked={noIndex} label="No index" onChange={(checked) => setValue("noIndex", checked, { shouldDirty: true })} />
                    <SeoToggle id="category-nofollow" checked={noFollow} label="No follow" onChange={(checked) => setValue("noFollow", checked, { shouldDirty: true })} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field><FieldLabel htmlFor="category-og-title">OG title</FieldLabel><AuthInput id="category-og-title" placeholder="e.g. Smartphones" {...register("ogTitle")} /></Field>
                    <Field><FieldLabel htmlFor="category-twitter-title">Twitter title</FieldLabel><AuthInput id="category-twitter-title" placeholder="e.g. Smartphones" {...register("twitterTitle")} /></Field>
                  </div>
                  <Field><FieldLabel htmlFor="category-og-description">OG description</FieldLabel><Textarea id="category-og-description" placeholder="e.g. Explore smartphones at GadgetSimp." className="min-h-20 rounded-field text-base md:text-sm" {...register("ogDescription")} /></Field>
                  <Field><FieldLabel htmlFor="category-twitter-description">Twitter description</FieldLabel><Textarea id="category-twitter-description" placeholder="e.g. Explore smartphones at GadgetSimp." className="min-h-20 rounded-field text-base md:text-sm" {...register("twitterDescription")} /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field data-invalid={Boolean(errors.ogImage)}><FieldLabel htmlFor="category-og-image">OG image</FieldLabel><AuthInput id="category-og-image" type="url" placeholder="e.g. https://cdn.example.com/categories/smartphones-og.webp" {...register("ogImage")} /><FieldError errors={[errors.ogImage]} /></Field>
                    <Field data-invalid={Boolean(errors.twitterImage)}><FieldLabel htmlFor="category-twitter-image">Twitter image</FieldLabel><AuthInput id="category-twitter-image" type="url" placeholder="e.g. https://cdn.example.com/categories/smartphones-twitter.webp" {...register("twitterImage")} /><FieldError errors={[errors.twitterImage]} /></Field>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </FieldGroup>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 cursor-pointer rounded-field">Close</Button>
          <Button type="submit" disabled={saving} className="h-11 cursor-pointer gap-2 rounded-field font-semibold">
            {saving ? <Spinner /> : null}
            {saving ? "Saving..." : category ? "Save category" : "Create category"}
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

function SeoToggle({ id, checked, label, onChange }: { id: string; checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-medium">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      {label}
    </label>
  );
}

function ImageField({ value, error, register, onChange }: { value: string; error?: { message?: string }; register: ReturnType<typeof useForm<CategoryFormValues>>["register"] extends (name: "image") => infer R ? R : never; onChange: (value: string) => void }) {
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
      const { data } = await mediaApi.upload(file, "category");
      onChange(data.media.url);
    } catch (uploadProblem) {
      setUploadError(errorMessage(uploadProblem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field data-invalid={Boolean(error || uploadError)}>
      <FieldLabel htmlFor="category-image">Image</FieldLabel>
      <div className="flex gap-3">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} aria-label="Upload category image" className="relative flex size-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-field border bg-muted/30 text-muted-foreground transition-colors hover:border-brand/50 disabled:pointer-events-none disabled:opacity-60">
          {value ? <span aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(\"${value}\")` }} /> : <ImageOff className="size-4" aria-hidden />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity hover:opacity-100 [@media(hover:none)]:opacity-100">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="relative">
            <AuthInput id="category-image" placeholder="Upload an image or paste e.g. https://cdn.example.com/category.webp" aria-invalid={Boolean(error || uploadError)} className={value ? "pr-14" : undefined} value={value} {...imageInput} onChange={(event) => { setUploadError(null); void onImageInputChange(event); }} />
            {value ? (
              <button type="button" onClick={() => { setUploadError(null); onChange(""); }} className="absolute right-1.5 top-1/2 z-10 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg bg-background/95 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground" aria-label="Clear category image">
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} className="sr-only" disabled={busy} onChange={onPick} aria-label="Choose category image file" />
        </div>
      </div>
      <FieldDescription>JPEG, PNG, WebP, GIF or AVIF up to 3MB, or paste an image URL.</FieldDescription>
      {uploadError ? <FieldError>{uploadError}</FieldError> : <FieldError errors={[error]} />}
    </Field>
  );
}

export function DeleteCategoryDialog({ category, onClose, onConfirm }: { category: AdminCategory | null; onClose: () => void; onConfirm: (category: AdminCategory) => void }) {
  return (
    <AlertDialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {category?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Categories with children cannot be archived until child categories are moved or archived.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => category && onConfirm(category)} className="cursor-pointer rounded-lg bg-destructive text-white hover:bg-destructive/90">
            Archive category
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function HomeVisibilityDialog({ category, onClose, onConfirm }: { category: AdminCategory | null; onClose: () => void; onConfirm: (category: AdminCategory) => void }) {
  const next = !(category?.showInHome ?? false);
  return (
    <AlertDialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{next ? "Show on home?" : "Remove from home?"}</AlertDialogTitle>
          <AlertDialogDescription>
            This changes the home-page curation flag for {category?.name}. Empty categories may still be hidden by the storefront.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => category && onConfirm(category)} className="cursor-pointer rounded-lg">
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
