/**
 * Everything about the storefront that is copy rather than code.
 *
 * Navigation, social handles, the trust strip, the FAQ and the footer columns
 * all live here so the chrome components stay presentational. A merchandiser
 * changing a menu label or a WhatsApp number edits one file, and every surface
 * that renders it - desktop nav, mobile drawer, footer, bottom bar - follows.
 */

import type { LucideIcon } from "lucide-react";
import {
  Headphones,
  Home,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Wallet,
  User,
} from "lucide-react";
import type { IconType } from "react-icons";
import { FaFacebookF, FaInstagram, FaWhatsapp } from "react-icons/fa6";

/* --------------------------------- contact -------------------------------- */

/** Everything but the digits, so one number can drive `tel:` and `wa.me`. */
function digitsOf(value: string) {
  return value.replace(/\D/g, "");
}

/** `+8801602817341` -> `+880 1602 817341`. Any other shape is left alone. */
function formatBdPhone(value: string) {
  const match = digitsOf(value).match(/^(880)(\d{4})(\d{6})$/);
  return match ? `+${match[1]} ${match[2]} ${match[3]}` : value;
}

const phoneE164 = process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "+8801602817341";
const phoneDigits = digitsOf(phoneE164);

/**
 * The one place the shop's phone, email and address are written down.
 *
 * Every surface that shows a number - top bar, drawer, footer, the WhatsApp
 * button, the FAQ - reads from here, so changing it is a one-line edit (or an
 * env var on the deployment) rather than a search across the component tree.
 * `tel:` and `wa.me` are derived from the same digits, which is what stops the
 * two from drifting apart.
 */
export const contact = {
  /** For display: `+880 1602 817341`. */
  phone: formatBdPhone(phoneE164),
  phoneHref: `tel:+${phoneDigits}`,
  /** `wa.me` wants bare digits, no `+`. */
  whatsappHref: `https://wa.me/${phoneDigits}`,
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "gadgersimp6@gmail.com",
  get emailHref() {
    return `mailto:${this.email}`;
  },
  location: "Dhaka, Bangladesh",
  /** Order value above which delivery is free, in the catalogue's currency. */
  freeDeliveryFrom: 5000,
} as const;

/**
 * A WhatsApp link that opens the chat with a message already typed.
 *
 * `wa.me` takes the body as a `?text=` query parameter and the app drops it
 * into the composer without sending, so the shopper still reviews it. Newlines
 * survive encoding, which is what lets an order read as a list rather than a
 * paragraph.
 */
export function whatsappLink(message?: string) {
  if (!message) return contact.whatsappHref;
  return `${contact.whatsappHref}?text=${encodeURIComponent(message)}`;
}

export const siteConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "GadgetSimp",
  description:
    "Gadgets, audio and accessories - curated, in stock, and delivered across Bangladesh.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  developer: {
    name: "Raju Ahmed",
    href: "https://rajuahmedbhuiyan.vercel.app/",
  },
} as const;

/* --------------------------------- hero ---------------------------------- */

export interface HeroSlide {
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  cta: { label: string; href: string };
  secondary?: { label: string; href: string };
  /** Picks the slide's backdrop palette. Keeps colour out of the component. */
  tone: "amber" | "cool" | "violet";
}

/**
 * Static campaign slides.
 *
 * Shaped the way a merchandised banner would be, so replacing this array with
 * an API response later is a data change rather than a rewrite of the slider.
 */
export const heroSlides: HeroSlide[] = [
  {
    eyebrow: "New season",
    title: "Gadgets that keep up",
    highlight: "with you",
    description:
      "Earbuds, smart watches and power banks from authorised distributors — in stock today, paid for at your door.",
    cta: { label: "Visit Shop", href: "/shop" },
    secondary: { label: "See today's deals", href: "/shop?onSale=true" },
    tone: "amber",
  },
  {
    eyebrow: "Bundle & save",
    title: "Combo packs worth",
    highlight: "grabbing",
    description:
      "Earbuds, cases, chargers and cables bundled together — one order, one delivery, and less than buying each on its own.",
    // Filters the listing by the `combo` category. Category slugs are not
    // products, so they cannot use the `/shop/<slug>` product route.
    cta: { label: "Shop combos", href: "/shop?category=combo" },
    tone: "violet",
  },
  {
    eyebrow: `Free delivery over ৳${contact.freeDeliveryFrom.toLocaleString("en-US")}`,
    title: "Delivered across",
    highlight: "Bangladesh",
    description:
      "Inside Dhaka in 24–48 hours, everywhere else in 2–4 days. Cash on delivery, nationwide.",
    cta: { label: "Visit Shop", href: "/shop" },
    tone: "cool",
  },
];

/* ------------------------------- navigation ------------------------------ */

export interface NavItem {
  label: string;
  href: string;
  description?: string;
  /**
   * Render as a plain anchor opening in a new tab, rather than a client-side
   * `<Link>`. Set on anything that leaves the site - the support entries all
   * point at WhatsApp.
   */
  external?: boolean;
}

export interface NavSection extends NavItem {
  children?: NavItem[];
}

/**
 * The primary menu. An item with `children` opens a panel on desktop and an
 * accordion in the mobile drawer - one shape, two presentations.
 */
export const mainNav: readonly NavSection[] = [
  { label: "Home", href: "/" },
  {
    label: "Shop",
    href: "/shop",
    children: [
      {
        label: "All products",
        href: "/shop",
        description: "The full catalogue, filterable by brand and price",
      },
      {
        label: "New arrivals",
        href: "/shop?sort=createdAt",
        description: "Everything added in the last 30 days",
      },
      {
        label: "Best sellers",
        href: "/shop?featured=true",
        description: "What other shoppers are buying most",
      },
      {
        label: "Clearance",
        href: "/shop?onSale=true",
        description: "Discounted stock while it lasts",
      },
    ],
  },
  {
    label: "Categories",
    href: "/categories",
    children: [
      { label: "Earbuds & headphones", href: "/shop?category=earbuds-headphones" },
      { label: "Smart watches", href: "/shop?category=smart-watches" },
      { label: "Power banks", href: "/shop?category=power-banks" },
      { label: "Chargers", href: "/shop?category=chargers" },
      { label: "Phone cases", href: "/shop?category=phone-cases" },
      { label: "Microphones", href: "/shop?category=microphones" },
    ],
  },
  { label: "Deals", href: "/shop?onSale=true" },
  { label: "Support", href: contact.whatsappHref, external: true },
];

/* --------------------------------- social -------------------------------- */

export interface SocialLink {
  label: string;
  href: string;
  icon: IconType;
  /** Brand colour for the hover state, as a raw value - these are not ours. */
  hoverClass: string;
}

export const socialLinks: SocialLink[] = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/gadgetsimp6",
    icon: FaInstagram,
    hoverClass: "hover:bg-[#E1306C] hover:text-white hover:border-[#E1306C]",
  },
  {
    label: "WhatsApp",
    href: contact.whatsappHref,
    icon: FaWhatsapp,
    hoverClass: "hover:bg-[#25D366] hover:text-white hover:border-[#25D366]",
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/gadgetsimp",
    icon: FaFacebookF,
    hoverClass: "hover:bg-[#1877F2] hover:text-white hover:border-[#1877F2]",
  },
];

/* ------------------------------- bottom bar ------------------------------ */

export interface TabItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Reads the cart count onto a badge. Only one tab needs it. */
  badge?: "cart";
}

/** The thumb-reachable bar below 1024px. Four is the most that stays tappable. */
export const mobileTabs: TabItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Cart", href: "/cart", icon: ShoppingCart, badge: "cart" },
  { label: "Profile", href: "/account", icon: User },
];

/* ------------------------------ trust strip ------------------------------ */

export const trustBadges = [
  {
    icon: Truck,
    title: "Free delivery",
    description: `On orders over ৳${contact.freeDeliveryFrom.toLocaleString("en-US")}`,
  },
  {
    icon: Wallet,
    title: "Cash on delivery",
    description: "Pay when it reaches your door",
  },
  {
    icon: RotateCcw,
    title: "7 day returns",
    description: "Changed your mind? Send it back",
  },
  {
    icon: Headphones,
    title: "Support till 10pm",
    description: "Real people, seven days a week",
  },
] as const;

/* ----------------------------------- faq --------------------------------- */

export const faqs = [
  {
    question: "How long does delivery take?",
    answer:
      "Inside Dhaka orders are delivered within 24–48 hours. Outside Dhaka takes 2–4 working days depending on the courier's coverage in your area. You will get an SMS with a tracking number the moment your parcel is handed over.",
  },
  {
    question: "Can I pay when the parcel arrives?",
    answer:
      "Yes. Cash on delivery is available nationwide, and it is currently the only payment method we accept. Please keep the exact amount ready — riders often cannot break large notes.",
  },
  {
    question: "Are the products original?",
    answer:
      "Every item is sourced from the brand's authorised distributor in Bangladesh and arrives sealed. Warranty is claimed through us, so you never have to deal with an importer directly.",
  },
  {
    question: "What if the item is faulty or not what I ordered?",
    answer:
      "Tell us within 7 days and we collect it at our own cost. A replacement ships as soon as the return is scanned by the courier, or you can take a full refund instead — whichever you prefer.",
  },
  {
    question: "How do I claim the warranty?",
    answer:
      "Message us on WhatsApp with your order number and a short description of the fault. Most claims are resolved without you posting anything; when a unit does need to come in, we send a rider to pick it up.",
  },
  {
    question: "Do you have a physical store?",
    answer:
      "We run a pickup counter in Dhanmondi, Dhaka, open 10am–8pm every day except Friday. Order online, choose store pickup at checkout, and collect it the same day.",
  },
] as const;

/* ---------------------------------- footer -------------------------------- */

export const footerNav: readonly {
  title: string;
  links: readonly NavItem[];
}[] = [
  {
    title: "Shop",
    links: [
      { label: "All products", href: "/shop" },
      { label: "New arrivals", href: "/shop?sort=createdAt" },
      { label: "Best sellers", href: "/shop?featured=true" },
      { label: "Clearance", href: "/shop?onSale=true" },
      // { label: "Gift cards", href: "/gift-cards" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Track your order", href: "/orders" },
      { label: "Delivery & pickup", href: "/" },
      { label: "Returns & refunds", href: "/" },
      { label: "Chat on WhatsApp", href: contact.whatsappHref, external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Careers", href: "/" },
      { label: "Blog", href: "/" },
    ],
  },
];

export const legalNav = [
  { label: "Privacy policy", href: "/" },
  { label: "Terms of service", href: "/" },
  { label: "Refund policy", href: "/" },
] as const;

/** The header's quick search, reused by the mobile drawer. */
export const searchConfig = {
  placeholder: "Search for earbuds, watches, chargers…",
  action: "/shop",
  name: "search",
} as const;
