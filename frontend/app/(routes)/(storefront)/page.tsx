import { Suspense } from "react";

import { HeroSlider } from "@/components/home/hero-slider";
import { Faq } from "@/components/home/faq";
import { FeaturedProducts } from "@/components/home/featured-products";
import { CategoryGrid } from "@/components/home/category-grid";
import { LatestProducts } from "@/components/home/latest-products";
import {
  CategoryGridSkeleton,
  FeaturedProductsSkeleton,
  LatestProductsSkeleton,
} from "@/components/home/section-skeletons";

/**
 * The home page.
 *
 * The hero slider and the FAQ are static and render immediately. The three catalogue
 * sections each sit behind their own `<Suspense>` boundary, so they stream in
 * independently as their calls come back rather than the whole page waiting on
 * the slowest one - and a section whose call fails degrades to its own empty
 * state without taking the others down.
 */
export default function HomePage() {
  return (
    <>
      <HeroSlider />

      <Suspense fallback={<FeaturedProductsSkeleton />}>
        <FeaturedProducts />
      </Suspense>

      <Suspense fallback={<CategoryGridSkeleton />}>
        <CategoryGrid />
      </Suspense>

      <Suspense fallback={<LatestProductsSkeleton />}>
        <LatestProducts />
      </Suspense>

      <Faq />
    </>
  );
}
