import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Catalog thumbnails are whatever URL the merchandiser pasted in - Walmart,
    // Apple, Wix, imgix, a Shopify CDN. There is no fixed host list to allow,
    // so the optimizer takes any https origin.
    //
    // Narrow this to the real CDN once media uploads move behind our own
    // domain; a wildcard lets anyone use our optimizer as an image proxy.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    // The catalog grid renders at these widths on the breakpoints we support.
    imageSizes: [64, 96, 128, 200, 256, 320, 384],
    formats: ["image/avif", "image/webp"],
    // Remote catalog images change under the same URL more often than the
    // default 4 hours would notice.
    minimumCacheTTL: 60 * 60 * 24,
  },
};

export default nextConfig;
