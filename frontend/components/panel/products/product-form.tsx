"use client";

/**
 * The product form, shared by creating and editing.
 *
 * One component for both, because they are the same form with two save
 * strategies. Creating collects every tab and posts once; editing saves the
 * tab you are on through its own `PATCH`. Building them separately is how the
 * two drift until a field exists on one screen and not the other.
 *
 * **Nothing calls the API until the relevant tab validates.** On create that
 * means every tab, and the strip marks the ones that need attention rather
 * than dumping a list of errors at the bottom. On edit it means the current
 * tab only - the others are already saved and are not being sent.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { AdminProduct, CategoryLeaf, TaxonomyRef } from "@/lib/api/admin/products";
import { adminProductsApi } from "@/lib/api/admin/products";
import {
  PRODUCT_TABS,
  emptyProductForm,
  formFromProduct,
  invalidTabs,
  toCreatePayload,
  toPatchBody,
  validateTab,
  type ProductFormState,
  type TabId,
} from "@/lib/panel/product-form";
import { productPermissions } from "@/lib/panel/permissions";
import { useAuth } from "@/lib/auth/auth-context";
import { apiMessage, useCreateProduct, useDeleteProduct } from "@/hooks/use-admin-products";
import { PanelPageHeading } from "@/components/panel/page-heading";
import { Button } from "@/components/ui/button";
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
import {
  BasicsPanel,
  DescriptionPanel,
  FormSummary,
  MediaPanel,
  SeoPanel,
  SpecsPanel,
  VariantsPanel,
} from "./form-panels";

export function ProductForm({
  product,
  leaves,
  brands,
}: {
  /** Absent when creating. */
  product?: AdminProduct;
  leaves: CategoryLeaf[];
  brands: TaxonomyRef[];
}) {
  const router = useRouter();
  const editing = Boolean(product);
  const { user } = useAuth();
  const permissions = productPermissions(user);

  const [state, setState] = useState<ProductFormState>(() =>
    product ? formFromProduct(product) : emptyProductForm(),
  );
  const [tab, setTab] = useState<TabId>("basics");
  // Only shown after an attempt to save, so an untouched form is not covered
  // in red before anything has been typed.
  const [showErrors, setShowErrors] = useState(false);
  const [savingTab, setSavingTab] = useState<TabId | null>(null);
  const [savedTab, setSavedTab] = useState<TabId | null>(null);
  const [confirming, setConfirming] = useState(false);

  const create = useCreateProduct();
  const remove = useDeleteProduct();

  const errors = validateTab(tab, state);
  const bad = invalidTabs(state);
  const visibleErrors = showErrors ? errors : {};

  const definition = PRODUCT_TABS.find((entry) => entry.id === tab)!;
  const panelProps = {
    state,
    setState,
    errors: visibleErrors,
    leaves,
    brands,
  };

  /* --------------------------------- save -------------------------------- */

  async function saveTab() {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) {
      toast.error("Fix the highlighted fields first");
      return;
    }
    if (!product) return;

    if (definition.sections.length === 0) return;

    setSavingTab(tab);
    try {
      /*
       * Sequentially, not in parallel. A tab can span three endpoints -
       * Basics is general, pricing and stock - and firing them together
       * means a partial save if the second fails while the third has already
       * landed. In order, the first failure stops the rest.
       */
      for (const section of definition.sections) {
        await patchFor(section, product.id, state, leaves);
      }
      setSavedTab(tab);
      toast.success(`${definition.label} saved`);
      router.refresh();
      window.setTimeout(() => setSavedTab(null), 2500);
    } catch (error) {
      toast.error(apiMessage(error, `Could not save ${definition.label.toLowerCase()}`));
    } finally {
      setSavingTab(null);
    }
  }

  async function submitNew() {
    setShowErrors(true);

    if (bad.size > 0) {
      // Land on the first tab that needs attention rather than reporting a
      // problem on a panel the person cannot see.
      const first = PRODUCT_TABS.find((entry) => bad.has(entry.id));
      if (first) setTab(first.id);
      toast.error(
        bad.size === 1
          ? "One tab needs attention"
          : `${bad.size} tabs need attention`,
      );
      return;
    }

    const created = await create
      .mutateAsync(toCreatePayload(state, leaves) as never)
      .catch(() => null);

    if (created) {
      toast.success("Product created");
      router.push(`/admin/products/${created.id}`);
    }
  }

  const live =
    state.status === "ACTIVE" && state.visibility === "PUBLIC" && editing;

  return (
    <>
      <PanelPageHeading
        title={editing ? product!.name : "New product"}
        description={
          editing ? `/shop/${product!.slug}` : "Everything the catalogue accepts."
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Back to products"
              className="size-10 cursor-pointer rounded-lg"
              render={<Link href="/admin/products" />}
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>

            {live ? (
              <Button
                variant="outline"
                size="icon"
                aria-label="View on the storefront"
                className="size-10 cursor-pointer rounded-lg"
                render={
                  <a
                    href={`/shop/${product!.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <ExternalLink className="size-4" aria-hidden />
              </Button>
            ) : null}

            {editing && permissions.remove ? (
              <Button
                variant="outline"
                size="icon"
                aria-label="Archive product"
                onClick={() => setConfirming(true)}
                className="size-10 cursor-pointer rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            ) : null}

          </div>
        }
      />

      <div >
        <FormSummary state={state} />
      </div>

      {/* Scrolls rather than wrapping - eight tabs would otherwise take three
          rows on a phone and push the panel off the screen. */}
      <nav
        aria-label="Product sections"
        className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1 rounded-lg border bg-muted/40 p-1">
          {PRODUCT_TABS.map((entry) => {
            const active = tab === entry.id;
            const problem = showErrors && bad.has(entry.id);

            return (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-current={active}
                  onClick={() => setTab(entry.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                  {problem ? (
                    <AlertCircle
                      className="size-3.5 text-destructive"
                      aria-label="needs attention"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="rounded-xl border bg-card">
        {/* The save button lives in the sticky bar below, not here - one
            button, always reachable, rather than two that could disagree. */}
        <header className="border-b px-4 py-2.5">
          <p className="text-xs text-muted-foreground">{definition.hint}</p>
        </header>

        <div className="p-4">
          {tab === "basics" && <BasicsPanel {...panelProps} />}
          {tab === "description" && <DescriptionPanel {...panelProps} />}
          {tab === "variants" && <VariantsPanel {...panelProps} editing={editing} />}
          {tab === "media" && <MediaPanel {...panelProps} />}
          {tab === "specs" && <SpecsPanel {...panelProps} editing={editing} />}
          {tab === "seo" && <SeoPanel {...panelProps} />}
        </div>
      </section>

      {/*
        * Sticky, because the form is eight panels tall and the thing you need
        * after filling one in is the button at the bottom. `-mx` bleeds it to
        * the panel's edge so it reads as a bar rather than a floating card,
        * and the safe-area inset keeps it clear of a phone's home indicator.
        */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t bg-background/90 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] supports-backdrop-filter:bg-background/75 supports-backdrop-filter:backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs",
              showErrors && bad.size > 0
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {showErrors && bad.size > 0 ? (
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            ) : null}
            {bad.size === 0
              ? "Everything checks out."
              : `${bad.size} ${bad.size === 1 ? "tab needs" : "tabs need"} attention.`}
          </p>

          {editing ? (
            definition.sections.length > 0 ? (
              <Button
                type="button"
                onClick={saveTab}
                disabled={savingTab !== null}
                className="h-11 shrink-0 cursor-pointer gap-2 rounded-lg px-5 text-sm font-semibold"
              >
                {savingTab === tab ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : savedTab === tab ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                {savingTab === tab
                  ? "Saving…"
                  : savedTab === tab
                    ? "Saved"
                    : `Save ${definition.label.toLowerCase()}`}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nothing to save on this tab.
              </p>
            )
          ) : (
            <Button
              onClick={submitNew}
              disabled={create.isPending}
              className="h-11 shrink-0 cursor-pointer gap-2 rounded-lg px-6 text-sm font-semibold"
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {create.isPending ? "Creating…" : "Create product"}
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive “{product!.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                It disappears from the storefront and from the products list.
                The record is kept rather than destroyed, so existing orders
                that reference it stay intact.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="cursor-pointer rounded-lg">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  remove.mutate(product!.id, {
                    onSuccess: () => router.push("/admin/products"),
                  })
                }
                className="cursor-pointer rounded-lg bg-destructive text-white hover:bg-destructive/90"
              >
                Archive product
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

/** Sends one section's body to the endpoint that owns it. */
function patchFor(
  section: string,
  id: string,
  state: ProductFormState,
  leaves: CategoryLeaf[],
) {
  const body = toPatchBody(section, state, leaves) as never;

  switch (section) {
    case "general":
      return adminProductsApi.patch.general(id, body);
    case "description":
      return adminProductsApi.patch.description(id, body);
    case "pricing":
      return adminProductsApi.patch.pricing(id, body);
    case "stock":
      return adminProductsApi.patch.stock(id, body);
    case "media":
      return adminProductsApi.patch.media(id, body);
    case "attributes":
      return adminProductsApi.patch.attributes(id, body);
    case "seo":
      return adminProductsApi.patch.seo(id, body);
    default:
      return Promise.resolve(null);
  }
}
