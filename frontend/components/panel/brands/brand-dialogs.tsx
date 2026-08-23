"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { ImageOff, Loader2, Upload, X } from "lucide-react";

import {
  CATALOG_STATUSES,
  CATALOG_VISIBILITIES,
  type AdminBrand,
  type BrandWritePayload,
  type CatalogStatus,
  type CatalogVisibility,
} from "@/lib/api/admin/brands";
import {
  CATALOG_STATUS_LABEL,
  VISIBILITY_LABEL,
} from "@/components/panel/brands/brand-badges";
import { AuthInput } from "@/components/auth/controls";
import { errorMessage } from "@/lib/auth/errors";
import { checkImage, IMAGE_ACCEPT, mediaApi } from "@/lib/api/media";
import { siteConfig } from "@/lib/config/site";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
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

const brandFormSchema = z.object({
  name: z.string().trim().min(1, "Required").max(160, "Must be at most 160 characters"),
  slug: slugSchema,
  description: optionalText(10_000),
  logo: optionalText(1024),
  website: optionalUrl,
  status: z.enum(CATALOG_STATUSES),
  visibility: z.enum(CATALOG_VISIBILITIES),
  publishedAt: z.string(),
  seoTitle: optionalText(70),
  seoDescription: optionalText(320),
  seoKeywords: z
    .string()
    .trim()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
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

type BrandFormValues = z.input<typeof brandFormSchema>;
type BrandFormData = z.output<typeof brandFormSchema>;

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

function brandSeoTitle(name: string) {
  return name.trim() ? `${name.trim()} Products | ${siteConfig.name}` : "";
}

function brandSeoDescription(name: string, description: string | undefined) {
  if (description?.trim()) return description.trim().slice(0, 320);
  return name.trim()
    ? `Shop ${name.trim()} products online at ${siteConfig.name}.`
    : "";
}

function brandCanonical(slug: string) {
  return slug.trim()
    ? `${siteConfig.url.replace(/\/$/, "")}/brands/${slug.trim()}`
    : "";
}

function brandKeywords(name: string) {
  const base = name.trim().toLowerCase();
  return base ? `${base}, ${base} products` : "";
}

function toInputDate(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function defaults(brand?: AdminBrand | null): BrandFormValues {
  return {
    name: brand?.name ?? "",
    slug: brand?.slug ?? "",
    description: brand?.description ?? "",
    logo: brand?.logo ?? "",
    website: brand?.website ?? "",
    status: brand?.status ?? "ACTIVE",
    visibility: brand?.visibility ?? "PUBLIC",
    publishedAt: toInputDate(brand?.publishedAt),
    seoTitle: brand?.seo?.title ?? "",
    seoDescription: brand?.seo?.description ?? "",
    seoKeywords: brand?.seo?.keywords?.join(", ") ?? "",
    canonicalUrl: brand?.seo?.canonicalUrl ?? "",
    noIndex: brand?.seo?.noIndex ?? false,
    noFollow: brand?.seo?.noFollow ?? false,
    ogTitle: brand?.seo?.ogTitle ?? "",
    ogDescription: brand?.seo?.ogDescription ?? "",
    ogImage: brand?.seo?.ogImage ?? "",
    twitterTitle: brand?.seo?.twitterTitle ?? "",
    twitterDescription: brand?.seo?.twitterDescription ?? "",
    twitterImage: brand?.seo?.twitterImage ?? "",
  };
}

function payload(values: BrandFormData): BrandWritePayload {
  const seo = {
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
  };

  return {
    name: values.name,
    slug: values.slug,
    ...(values.description ? { description: values.description } : {}),
    ...(values.logo ? { logo: values.logo } : {}),
    ...(values.website ? { website: values.website } : {}),
    status: values.status,
    visibility: values.visibility,
    publishedAt: values.publishedAt
      ? new Date(`${values.publishedAt}T00:00:00.000`).toISOString()
      : null,
    seo,
  };
}

export function BrandFormDialog({
  open,
  brand,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  brand: AdminBrand | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (body: BrandWritePayload) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        {open ? (
          <BrandFormBody
            key={brand?.id ?? "new"}
            brand={brand}
            saving={saving}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BrandFormBody({
  brand,
  saving,
  onClose,
  onSave,
}: {
  brand: AdminBrand | null;
  saving: boolean;
  onClose: () => void;
  onSave: (body: BrandWritePayload) => void;
}) {
  const form = useForm<BrandFormValues, unknown, BrandFormData>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: defaults(brand),
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
  const status = useWatch({ control, name: "status" }) ?? "ACTIVE";
  const visibility = useWatch({ control, name: "visibility" }) ?? "PUBLIC";
  const noIndex = useWatch({ control, name: "noIndex" }) ?? false;
  const noFollow = useWatch({ control, name: "noFollow" }) ?? false;
  const slug = useWatch({ control, name: "slug" }) ?? "";
  const description = useWatch({ control, name: "description" }) ?? "";
  const logo = useWatch({ control, name: "logo" }) ?? "";
  const seoTitle = useWatch({ control, name: "seoTitle" }) ?? "";
  const seoDescription = useWatch({ control, name: "seoDescription" }) ?? "";
  const seoKeywords = useWatch({ control, name: "seoKeywords" }) ?? "";
  const canonicalUrl = useWatch({ control, name: "canonicalUrl" }) ?? "";
  const ogTitle = useWatch({ control, name: "ogTitle" }) ?? "";
  const ogDescription = useWatch({ control, name: "ogDescription" }) ?? "";
  const ogImage = useWatch({ control, name: "ogImage" }) ?? "";
  const twitterTitle = useWatch({ control, name: "twitterTitle" }) ?? "";
  const twitterDescription = useWatch({ control, name: "twitterDescription" }) ?? "";
  const twitterImage = useWatch({ control, name: "twitterImage" }) ?? "";
  const slugField = register("slug");
  const previousGeneratedSlug = useRef(slugify(defaults(brand).name));
  const previousSeo = useRef({
    title: defaults(brand).seoTitle,
    description: defaults(brand).seoDescription,
    keywords: defaults(brand).seoKeywords,
    canonicalUrl: defaults(brand).canonicalUrl,
    ogTitle: defaults(brand).ogTitle,
    ogDescription: defaults(brand).ogDescription,
    ogImage: defaults(brand).ogImage,
    twitterTitle: defaults(brand).twitterTitle,
    twitterDescription: defaults(brand).twitterDescription,
    twitterImage: defaults(brand).twitterImage,
  });

  useEffect(() => {
    if (brand) return;
    const nextSlug = slugify(name);
    const canUpdateSlug = !slug || slug === previousGeneratedSlug.current;

    if (canUpdateSlug && slug !== nextSlug) {
      setValue("slug", nextSlug, { shouldDirty: true, shouldValidate: true });
    }

    previousGeneratedSlug.current = nextSlug;
  }, [brand, name, setValue, slug]);

  useEffect(() => {
    const next = {
      title: brandSeoTitle(name),
      description: brandSeoDescription(name, description),
      keywords: brandKeywords(name),
      canonicalUrl: brandCanonical(slug),
      ogTitle: brandSeoTitle(name),
      ogDescription: brandSeoDescription(name, description),
      ogImage: logo,
      twitterTitle: brandSeoTitle(name),
      twitterDescription: brandSeoDescription(name, description),
      twitterImage: logo,
    };

    if (
      (!seoTitle || seoTitle === previousSeo.current.title) &&
      seoTitle !== next.title
    ) {
      setValue("seoTitle", next.title, { shouldDirty: true });
    }
    if (
      (!seoDescription || seoDescription === previousSeo.current.description) &&
      seoDescription !== next.description
    ) {
      setValue("seoDescription", next.description, { shouldDirty: true });
    }
    if (
      (!seoKeywords || seoKeywords === previousSeo.current.keywords) &&
      seoKeywords !== next.keywords
    ) {
      setValue("seoKeywords", next.keywords, { shouldDirty: true });
    }
    if (
      (!canonicalUrl || canonicalUrl === previousSeo.current.canonicalUrl) &&
      canonicalUrl !== next.canonicalUrl
    ) {
      setValue("canonicalUrl", next.canonicalUrl, { shouldDirty: true });
    }
    if (
      (!ogTitle || ogTitle === previousSeo.current.ogTitle) &&
      ogTitle !== next.ogTitle
    ) {
      setValue("ogTitle", next.ogTitle, { shouldDirty: true });
    }
    if (
      (!ogDescription || ogDescription === previousSeo.current.ogDescription) &&
      ogDescription !== next.ogDescription
    ) {
      setValue("ogDescription", next.ogDescription, { shouldDirty: true });
    }
    if (
      (!ogImage || ogImage === previousSeo.current.ogImage) &&
      ogImage !== next.ogImage
    ) {
      setValue("ogImage", next.ogImage, { shouldDirty: true });
    }
    if (
      (!twitterTitle || twitterTitle === previousSeo.current.twitterTitle) &&
      twitterTitle !== next.twitterTitle
    ) {
      setValue("twitterTitle", next.twitterTitle, { shouldDirty: true });
    }
    if (
      (!twitterDescription ||
        twitterDescription === previousSeo.current.twitterDescription) &&
      twitterDescription !== next.twitterDescription
    ) {
      setValue("twitterDescription", next.twitterDescription, {
        shouldDirty: true,
      });
    }
    if (
      (!twitterImage || twitterImage === previousSeo.current.twitterImage) &&
      twitterImage !== next.twitterImage
    ) {
      setValue("twitterImage", next.twitterImage, { shouldDirty: true });
    }

    previousSeo.current = next;
  }, [
    canonicalUrl,
    description,
    logo,
    name,
    ogDescription,
    ogImage,
    ogTitle,
    seoDescription,
    seoKeywords,
    seoTitle,
    setValue,
    slug,
    twitterDescription,
    twitterImage,
    twitterTitle,
  ]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{brand ? "Edit brand" : "Create brand"}</DialogTitle>
        <DialogDescription>
          Public listings only show brands that are Active and Public.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit((values) => onSave(payload(values)))} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="-mr-1 min-h-0 overflow-y-auto pr-3 pl-1 [scrollbar-gutter:stable]">
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="brand-name">Name</FieldLabel>
              <AuthInput
                id="brand-name"
                placeholder="e.g. Apple"
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={Boolean(errors.slug)}>
              <FieldLabel htmlFor="brand-slug">Slug</FieldLabel>
              <AuthInput
                id="brand-slug"
                placeholder="e.g. apple"
                autoComplete="off"
                aria-invalid={Boolean(errors.slug)}
                {...slugField}
                onChange={(event) => {
                  event.target.value = formatSlugInput(event.target.value);
                  void slugField.onChange(event);
                }}
              />
              <FieldDescription>Lowercase URL slug, e.g. apple-accessories.</FieldDescription>
              <FieldError errors={[errors.slug]} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.status)}>
                <FieldLabel htmlFor="brand-status">Status</FieldLabel>
                <Select
                  value={status}
                  onValueChange={(next) =>
                    setValue("status", next as CatalogStatus, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="brand-status" className="h-12 w-full cursor-pointer rounded-field text-base data-[size=default]:h-12 md:text-sm">
                    <SelectValue>
                      {(current) => CATALOG_STATUS_LABEL[current as CatalogStatus]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATALOG_STATUSES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {CATALOG_STATUS_LABEL[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field data-invalid={Boolean(errors.visibility)}>
                <FieldLabel htmlFor="brand-visibility">Visibility</FieldLabel>
                <Select
                  value={visibility}
                  onValueChange={(next) =>
                    setValue("visibility", next as CatalogVisibility, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger id="brand-visibility" className="h-12 w-full cursor-pointer rounded-field text-base data-[size=default]:h-12 md:text-sm">
                    <SelectValue>
                      {(current) => VISIBILITY_LABEL[current as CatalogVisibility]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATALOG_VISIBILITIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {VISIBILITY_LABEL[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Public is selected by default.</FieldDescription>
              </Field>
            </div>

            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="brand-description">Description</FieldLabel>
              <Textarea
                id="brand-description"
                placeholder="e.g. Premium phones, tablets, watches and accessories."
                className="min-h-24 rounded-field text-base md:text-sm"
                aria-invalid={Boolean(errors.description)}
                {...register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <LogoField
                value={logo}
                error={errors.logo}
                onChange={(value) =>
                  setValue("logo", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                register={register("logo")}
              />
              <Field data-invalid={Boolean(errors.website)}>
                <FieldLabel htmlFor="brand-website">Website</FieldLabel>
                <AuthInput
                  id="brand-website"
                  type="url"
                  placeholder="e.g. https://www.apple.com"
                  aria-invalid={Boolean(errors.website)}
                  {...register("website")}
                />
                <FieldError errors={[errors.website]} />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="brand-published">Published date</FieldLabel>
              <Input
                id="brand-published"
                type="date"
                className="h-12 cursor-pointer rounded-field text-base md:text-sm"
                {...register("publishedAt")}
              />
            </Field>

            <Accordion defaultValue={[]} className="rounded-lg border">
              <AccordionItem value="seo" className="border-b-0">
                <AccordionTrigger className="cursor-pointer px-3 py-3 hover:no-underline">
                  <span className="grid gap-0.5">
                    <span className="font-heading text-sm font-bold tracking-tight">
                      SEO
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      Auto-filled from brand details. Open to fine tune search
                      and social previews.
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="grid gap-3 px-3">
                  <Field data-invalid={Boolean(errors.seoTitle)}>
                    <FieldLabel htmlFor="seo-title">Title</FieldLabel>
                    <AuthInput
                      id="seo-title"
                      placeholder="e.g. Apple Products | GadgetSimp"
                      {...register("seoTitle")}
                    />
                    <FieldError errors={[errors.seoTitle]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.seoDescription)}>
                    <FieldLabel htmlFor="seo-description">Description</FieldLabel>
                    <Textarea
                      id="seo-description"
                      placeholder="e.g. Shop Apple phones, chargers and accessories online."
                      className="min-h-20 rounded-field text-base md:text-sm"
                      {...register("seoDescription")}
                    />
                    <FieldError errors={[errors.seoDescription]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.seoKeywords)}>
                    <FieldLabel htmlFor="seo-keywords">Keywords</FieldLabel>
                    <AuthInput
                      id="seo-keywords"
                      placeholder="e.g. apple, apple products, iphone accessories"
                      {...register("seoKeywords")}
                    />
                    <FieldDescription>
                      Comma separated, maximum 30.
                    </FieldDescription>
                    <FieldError errors={[errors.seoKeywords]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.canonicalUrl)}>
                    <FieldLabel htmlFor="seo-canonical">Canonical URL</FieldLabel>
                    <AuthInput
                      id="seo-canonical"
                      type="url"
                      placeholder="e.g. https://gadgetsimp.dev/brands/apple"
                      {...register("canonicalUrl")}
                    />
                    <FieldError errors={[errors.canonicalUrl]} />
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SeoToggle
                      id="seo-noindex"
                      checked={noIndex}
                      label="No index"
                      onChange={(checked) =>
                        setValue("noIndex", checked, { shouldDirty: true })
                      }
                    />
                    <SeoToggle
                      id="seo-nofollow"
                      checked={noFollow}
                      label="No follow"
                      onChange={(checked) =>
                        setValue("noFollow", checked, { shouldDirty: true })
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field data-invalid={Boolean(errors.ogTitle)}>
                      <FieldLabel htmlFor="og-title">OG title</FieldLabel>
                      <AuthInput
                        id="og-title"
                        placeholder="e.g. Apple Products"
                        {...register("ogTitle")}
                      />
                      <FieldError errors={[errors.ogTitle]} />
                    </Field>
                    <Field data-invalid={Boolean(errors.twitterTitle)}>
                      <FieldLabel htmlFor="twitter-title">Twitter title</FieldLabel>
                      <AuthInput
                        id="twitter-title"
                        placeholder="e.g. Apple Products"
                        {...register("twitterTitle")}
                      />
                      <FieldError errors={[errors.twitterTitle]} />
                    </Field>
                  </div>
                  <Field data-invalid={Boolean(errors.ogDescription)}>
                    <FieldLabel htmlFor="og-description">OG description</FieldLabel>
                    <Textarea
                      id="og-description"
                      placeholder="e.g. Explore Apple products available from GadgetSimp."
                      className="min-h-20 rounded-field text-base md:text-sm"
                      {...register("ogDescription")}
                    />
                    <FieldError errors={[errors.ogDescription]} />
                  </Field>
                  <Field data-invalid={Boolean(errors.twitterDescription)}>
                    <FieldLabel htmlFor="twitter-description">
                      Twitter description
                    </FieldLabel>
                    <Textarea
                      id="twitter-description"
                      placeholder="e.g. Explore Apple products available from GadgetSimp."
                      className="min-h-20 rounded-field text-base md:text-sm"
                      {...register("twitterDescription")}
                    />
                    <FieldError errors={[errors.twitterDescription]} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field data-invalid={Boolean(errors.ogImage)}>
                      <FieldLabel htmlFor="og-image">OG image</FieldLabel>
                      <AuthInput
                        id="og-image"
                        type="url"
                        placeholder="e.g. https://cdn.example.com/brands/apple-og.webp"
                        {...register("ogImage")}
                      />
                      <FieldError errors={[errors.ogImage]} />
                    </Field>
                    <Field data-invalid={Boolean(errors.twitterImage)}>
                      <FieldLabel htmlFor="twitter-image">Twitter image</FieldLabel>
                      <AuthInput
                        id="twitter-image"
                        type="url"
                        placeholder="e.g. https://cdn.example.com/brands/apple-twitter.webp"
                        {...register("twitterImage")}
                      />
                      <FieldError errors={[errors.twitterImage]} />
                    </Field>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </FieldGroup>
        </div>

        <DialogFooter className="mt-4 shrink-0">
          <Button type="button" variant="outline" onClick={onClose} className="h-11 cursor-pointer rounded-field">
            Close
          </Button>
          <Button type="submit" disabled={saving} className="h-11 cursor-pointer gap-2 rounded-field font-semibold">
            {saving ? <Spinner /> : null}
            {saving ? "Saving..." : brand ? "Save brand" : "Create brand"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function SeoToggle({
  id,
  checked,
  label,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-medium">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      {label}
    </label>
  );
}

function LogoField({
  value,
  error,
  register,
  onChange,
}: {
  value: string;
  error?: { message?: string };
  register: UseFormRegisterReturn<"logo">;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { onChange: onLogoInputChange, ...logoInput } = register;

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
      const { data } = await mediaApi.upload(file, "brand");
      onChange(data.media.url);
    } catch (uploadProblem) {
      setUploadError(errorMessage(uploadProblem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field data-invalid={Boolean(error || uploadError)}>
      <FieldLabel htmlFor="brand-logo">Logo</FieldLabel>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Upload brand logo"
          className="relative flex size-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-field border bg-muted/30 text-muted-foreground transition-colors hover:border-brand/50 disabled:pointer-events-none disabled:opacity-60"
        >
          {value ? (
            <span
              aria-hidden
              className="absolute inset-0 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${value}")` }}
            />
          ) : (
            <ImageOff className="size-4" aria-hidden />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity hover:opacity-100 [@media(hover:none)]:opacity-100">
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="relative">
            <AuthInput
              id="brand-logo"
              placeholder="Upload an image or paste e.g. https://cdn.example.com/logo.webp"
              aria-invalid={Boolean(error || uploadError)}
              className={value ? "pr-14" : undefined}
              value={value}
              {...logoInput}
              onChange={(event) => {
                setUploadError(null);
                void onLogoInputChange(event);
              }}
            />
            {value ? (
              <button
                type="button"
                onClick={() => {
                  setUploadError(null);
                  onChange("");
                }}
                className="absolute right-1.5 top-1/2 z-10 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg bg-background/95 text-muted-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Clear brand logo"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={onPick}
            aria-label="Choose brand logo file"
          />
        </div>
      </div>
      <FieldDescription>
        JPEG, PNG, WebP, GIF or AVIF up to 3MB, or paste a hosted image URL.
      </FieldDescription>
      {uploadError ? (
        <FieldError>{uploadError}</FieldError>
      ) : (
        <FieldError errors={[error]} />
      )}
    </Field>
  );
}

export function DeleteBrandDialog({
  brand,
  onClose,
  onConfirm,
}: {
  brand: AdminBrand | null;
  onClose: () => void;
  onConfirm: (brand: AdminBrand) => void;
}) {
  return (
    <AlertDialog open={brand !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {brand?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The brand is marked archived and removed from public listings. Products
            that already reference it keep their record.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-lg">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => brand && onConfirm(brand)}
            className="cursor-pointer rounded-lg bg-destructive text-white hover:bg-destructive/90"
          >
            Archive brand
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
