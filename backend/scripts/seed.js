"use strict";

/**
 * Development seed: one account per role plus a realistic mobile-accessory
 * catalog.
 *
 * **This script deletes data.** It wipes the collections it owns before
 * writing, which is what makes it idempotent - and what makes it dangerous
 * pointed at the wrong database.
 *
 * Two guards, because `NODE_ENV=production` alone is not enough: a developer's
 * .env routinely has NODE_ENV=development while MONGODB_URI points at a shared
 * Atlas cluster, and that combination looks completely safe right up until it
 * erases everyone's data.
 *
 *   1. Never runs when NODE_ENV=production.
 *   2. Never runs against a non-local database unless SEED_CONFIRM=yes.
 *
 *   npm run seed                    # local mongod
 *   SEED_CONFIRM=yes npm run seed   # anything else
 */

const mongoose = require("mongoose");
const env = require("../src/config/env");
const logger = require("../src/config/logger");
const {
  connectDatabase,
  disconnectDatabase,
  ensureIndexes,
} = require("../src/config/database");
const Attribute = require("../src/modules/attribute/attribute.model");
const Brand = require("../src/modules/brand/brand.model");
const Cart = require("../src/modules/cart/cart.model");
const Category = require("../src/modules/category/category.model");
const Media = require("../src/modules/media/media.model");
const Order = require("../src/modules/order/order.model");
const Product = require("../src/modules/product/product.model");
const Variant = require("../src/modules/product/variant.model");
const User = require("../src/modules/user/user.model");
const Wishlist = require("../src/modules/wishlist/wishlist.model");
const PendingRegistration = require("../src/modules/auth/pendingRegistration.model");
const { Counter } = require("../src/shared/sequence");
const {
  ATTRIBUTE_SOURCE,
  ATTRIBUTE_TYPE,
  AUTH_PROVIDERS,
  CATALOG_STATUS,
  PRODUCT_STATUS,
  PRODUCT_TYPE,
  PRODUCT_VISIBILITY,
  ROLES,
  STOCK_STATUS,
  USER_STATUS,
  VISIBILITY,
} = require("../src/shared/constants");

const publishedAt = new Date("2026-01-01T00:00:00.000Z");

const brandsSeed = [
  ["Anker", "anker", "Reliable charging, audio and smart mobile accessories.", "https://www.anker.com"],
  ["Baseus", "baseus", "Practical accessories for everyday phone power, protection and travel.", "https://www.baseus.com"],
  ["UGREEN", "ugreen", "Cables, hubs and charging accessories for mobile and desk setups.", "https://www.ugreen.com"],
  ["Xiaomi", "xiaomi", "Value-focused smart devices, wearables and mobile accessories.", "https://www.mi.com"],
  ["Samsung", "samsung", "Galaxy-ready wearables, chargers, audio and phone add-ons.", "https://www.samsung.com"],
  ["Apple", "apple", "iPhone-first accessories for MagSafe, charging and daily carry.", "https://www.apple.com"],
  ["Sony", "sony", "Audio accessories with strong sound tuning and clean build quality.", "https://www.sony.com"],
  ["JBL", "jbl", "Portable audio gear for commute, calls and workouts.", "https://www.jbl.com"],
  ["Logitech", "logitech", "Creator and communication accessories for phone-first workflows.", "https://www.logitech.com"],
  ["OnePlus", "oneplus", "Fast-charge, audio and wearable accessories for Android users.", "https://www.oneplus.com"],
];

const attributeSeeds = [
  ["Color", "color", "color", ATTRIBUTE_SOURCE.VARIANT, ATTRIBUTE_TYPE.COLOR],
  ["Connector", "connector", "connector", ATTRIBUTE_SOURCE.VARIANT, ATTRIBUTE_TYPE.SELECT],
  ["Strap Size", "strap_size", "strap-size", ATTRIBUTE_SOURCE.VARIANT, ATTRIBUTE_TYPE.SELECT],
  ["Pack Size", "pack_size", "pack-size", ATTRIBUTE_SOURCE.VARIANT, ATTRIBUTE_TYPE.SELECT],
  ["Phone Model", "phone_model", "phone-model", ATTRIBUTE_SOURCE.VARIANT, ATTRIBUTE_TYPE.SELECT],
  ["Compatibility", "compatibility", "compatibility", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.CHECKBOX],
  ["Connectivity", "connectivity", "connectivity", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.SELECT],
  ["Battery Life", "battery_life", "battery-life", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.RANGE, 0, 100],
  ["Capacity", "capacity_mah", "capacity", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.RANGE, 0, 50000],
  ["Output Wattage", "output_wattage", "output-wattage", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.RANGE, 0, 240],
  ["Cable Length", "cable_length_m", "cable-length", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.RANGE, 0, 5],
  ["Material", "material", "material", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.SELECT],
  ["Water Resistance", "water_resistance", "water-resistance", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.SELECT],
  ["Warranty", "warranty_months", "warranty", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.RANGE, 0, 36],
  ["Noise Cancelling", "noise_cancelling", "noise-cancelling", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.SELECT],
  ["Microphone Pattern", "microphone_pattern", "microphone-pattern", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.SELECT],
  ["Mount Type", "mount_type", "mount-type", ATTRIBUTE_SOURCE.PRODUCT, ATTRIBUTE_TYPE.SELECT],
];

const categorySeeds = [
  {
    name: "Neckbands",
    singular: "Neckband",
    slug: "neckbands",
    image: "https://i5.walmartimages.com/seo/Kcavykas-Noise-Cancelling-Wireless-Neckband-Earbuds-Black_53d2c61e-98f6-4ddb-a3b7-976f7594c150.858fb21088949d5807d78fa9244cc2d5.jpeg",
    images: [
      "https://i5.walmartimages.com/seo/Kcavykas-Noise-Cancelling-Wireless-Neckband-Earbuds-Black_53d2c61e-98f6-4ddb-a3b7-976f7594c150.858fb21088949d5807d78fa9244cc2d5.jpeg",
      "https://i5.walmartimages.com/seo/Kcavykas-Noise-Cancelling-Wireless-Neckband-Earbuds-Black_53d2c61e-98f6-4ddb-a3b7-976f7594c150.858fb21088949d5807d78fa9244cc2d5.jpeg",
      "https://i5.walmartimages.com/seo/Kcavykas-Noise-Cancelling-Wireless-Neckband-Earbuds-Black_53d2c61e-98f6-4ddb-a3b7-976f7594c150.858fb21088949d5807d78fa9244cc2d5.jpeg",
    ],
    basePrice: 1290,
    keywords: ["neckband", "bluetooth", "commute"],
    attributes: ["compatibility", "connectivity", "battery_life", "water_resistance", "warranty_months", "noise_cancelling", "color"],
    names: [
      { brand: "oneplus", model: "Bullets Wireless Z2 Neckband" },
      { brand: "sony", model: "WI-C100 Wireless Neckband" },
      { brand: "jbl", model: "Tune 215BT Neckband" },
      { brand: "samsung", model: "Level U2 Neckband" },
      { brand: "xiaomi", model: "Mi Neckband Bluetooth Earphones Pro" },
      { brand: "anker", model: "Soundcore Life U2 Neckband" },
      { brand: "baseus", model: "Bowie P1 Neckband" },
      { brand: "ugreen", model: "HiTune H5 Bluetooth Neckband" },
      { brand: "oneplus", model: "Bullets Wireless Z2 ANC Neckband" },
      { brand: "sony", model: "WI-C310 Wireless Neckband" },
    ],
  },
  {
    name: "Smart Watches",
    singular: "Smart Watch",
    slug: "smart-watches",
    image: "https://funtrafic.imgix.net/catalog/product/6/4/642615_1.png?auto=format",
    images: [
      "https://funtrafic.imgix.net/catalog/product/6/4/642615_1.png?auto=format",
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-s9-digitalmat-gallery-1-202309?wid=728&hei=666&fmt=png-alpha&.v=1693703822208",
      "https://funtrafic.imgix.net/catalog/product/6/4/642615_1.png?auto=format",
    ],
    basePrice: 3490,
    keywords: ["watch", "wearable", "fitness"],
    attributes: ["compatibility", "connectivity", "battery_life", "water_resistance", "warranty_months", "color", "strap_size"],
    names: [
      { brand: "apple", model: "Watch Series 9" },
      { brand: "samsung", model: "Galaxy Watch6" },
      { brand: "xiaomi", model: "Redmi Watch 4" },
      { brand: "oneplus", model: "Watch 2" },
      { brand: "samsung", model: "Galaxy Watch FE" },
      { brand: "apple", model: "Watch SE" },
      { brand: "xiaomi", model: "Mi Watch Lite" },
      { brand: "sony", model: "SmartWatch 3" },
      { brand: "oneplus", model: "Nord Watch" },
      { brand: "samsung", model: "Galaxy Fit3" },
    ],
  },
  {
    name: "Microphones",
    singular: "Microphone",
    slug: "microphones",
    image: "https://i5.walmartimages.com/seo/H-A-HA-OM-L-Professional-Grade-Wearable-Omni-Directional-Miniature-Lavalier-Microphone-with-3-5mm-TRS-Locking-Connector_7b764946-1a04-49db-a479-a1523aa7da2b.435877b3bfe49ed116426a8803d03484.jpeg?odnBg=FFFFFF&odnHeight=768&odnWidth=768",
    images: [
      "https://i5.walmartimages.com/seo/H-A-HA-OM-L-Professional-Grade-Wearable-Omni-Directional-Miniature-Lavalier-Microphone-with-3-5mm-TRS-Locking-Connector_7b764946-1a04-49db-a479-a1523aa7da2b.435877b3bfe49ed116426a8803d03484.jpeg?odnBg=FFFFFF&odnHeight=768&odnWidth=768",
      "https://resource.logitechg.com/w_800,c_limit,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/logitech/en/products/microphones/yeti-nano/gallery/yeti-nano-gallery-1-black.png?v=1",
      "https://i5.walmartimages.com/seo/H-A-HA-OM-L-Professional-Grade-Wearable-Omni-Directional-Miniature-Lavalier-Microphone-with-3-5mm-TRS-Locking-Connector_7b764946-1a04-49db-a479-a1523aa7da2b.435877b3bfe49ed116426a8803d03484.jpeg?odnBg=FFFFFF&odnHeight=768&odnWidth=768",
    ],
    basePrice: 1790,
    keywords: ["microphone", "creator", "vlog"],
    attributes: ["compatibility", "connectivity", "microphone_pattern", "warranty_months", "color", "connector"],
    names: [
      { brand: "logitech", model: "Blue Yeti Nano USB Microphone" },
      { brand: "sony", model: "ECM-LV1 Lavalier Microphone" },
      { brand: "jbl", model: "Quantum Stream Microphone" },
      { brand: "ugreen", model: "USB-C Lavalier Microphone" },
      { brand: "baseus", model: "Wireless Lavalier Microphone" },
      { brand: "xiaomi", model: "Wireless Lavalier Microphone" },
      { brand: "anker", model: "PowerConf Bluetooth Speakerphone" },
      { brand: "samsung", model: "USB-C Headset Microphone" },
      { brand: "apple", model: "EarPods Lightning Microphone" },
      { brand: "sony", model: "ECM-W2BT Wireless Microphone" },
    ],
  },
  {
    name: "Chargers",
    singular: "Charger",
    slug: "chargers",
    image: "https://uk.static.webuy.com/product_images/New%20Accessories/CeX%20basics%20-%20Cables/PSU5V3AEUCEXB_l.jpg",
    images: [
      "https://uk.static.webuy.com/product_images/New%20Accessories/CeX%20basics%20-%20Cables/PSU5V3AEUCEXB_l.jpg",
      "https://uk.static.webuy.com/product_images/New%20Accessories/CeX%20basics%20-%20Cables/PSU5V3AEUCEXB_l.jpg",
      "https://uk.static.webuy.com/product_images/New%20Accessories/CeX%20basics%20-%20Cables/PSU5V3AEUCEXB_l.jpg",
    ],
    basePrice: 990,
    keywords: ["charger", "fast-charge", "usb-c"],
    attributes: ["compatibility", "output_wattage", "warranty_months", "connector"],
    names: [
      { brand: "anker", model: "Nano II 65W USB-C Charger" },
      { brand: "apple", model: "20W USB-C Power Adapter" },
      { brand: "samsung", model: "25W USB-C Super Fast Charger" },
      { brand: "ugreen", model: "Nexode 65W GaN Charger" },
      { brand: "baseus", model: "GaN3 Pro 65W Charger" },
      { brand: "xiaomi", model: "67W Turbo Charger" },
      { brand: "oneplus", model: "SUPERVOOC 80W Power Adapter" },
      { brand: "anker", model: "PowerPort III 20W Charger" },
      { brand: "ugreen", model: "30W USB-C Charger" },
      { brand: "samsung", model: "45W USB-C Power Adapter" },
    ],
  },
  {
    name: "Power Banks",
    singular: "Power Bank",
    slug: "power-banks",
    image: "https://www.walkntalk.com.au/cdn/shop/products/PWT-B5000-LED_1.jpg?v=1634191605&width=1080",
    images: [
      "https://www.walkntalk.com.au/cdn/shop/products/PWT-B5000-LED_1.jpg?v=1634191605&width=1080",
      "https://gifts.dsm.ru/upload/dev2fun.imagecompress/webp/iblock/c5e/qxyycxha6bt5njtuvjbmlbl7r91zn88u.webp",
      "https://www.walkntalk.com.au/cdn/shop/products/PWT-B5000-LED_1.jpg?v=1634191605&width=1080",
    ],
    basePrice: 2190,
    keywords: ["power-bank", "battery", "travel"],
    attributes: ["compatibility", "capacity_mah", "output_wattage", "warranty_months", "color"],
    names: [
      { brand: "anker", model: "PowerCore 10000 Power Bank" },
      { brand: "baseus", model: "Bipow 20000mAh Power Bank" },
      { brand: "xiaomi", model: "Mi 3 Ultra Compact Power Bank" },
      { brand: "ugreen", model: "145W 25000mAh Power Bank" },
      { brand: "samsung", model: "10000mAh Battery Pack" },
      { brand: "apple", model: "MagSafe Battery Pack" },
      { brand: "anker", model: "MagGo 10000mAh Power Bank" },
      { brand: "baseus", model: "Adaman 20000mAh Power Bank" },
      { brand: "oneplus", model: "Power Bank 10000mAh" },
      { brand: "ugreen", model: "Magnetic Wireless Power Bank" },
    ],
  },
  {
    name: "Phone Cases",
    singular: "Phone Case",
    slug: "phone-cases",
    image: "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MT203?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1692994340283",
    images: [
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MT203?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1692994340283",
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MT203?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1692994340283",
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MT203?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1692994340283",
    ],
    basePrice: 590,
    keywords: ["case", "cover", "protection"],
    attributes: ["compatibility", "material", "warranty_months", "color", "phone_model"],
    names: [
      { brand: "apple", model: "iPhone 15 Clear Case with MagSafe" },
      { brand: "samsung", model: "Galaxy S24 Silicone Case" },
      { brand: "baseus", model: "Magnetic Phone Case" },
      { brand: "ugreen", model: "Protective Phone Case" },
      { brand: "xiaomi", model: "Redmi Note 13 Silicone Case" },
      { brand: "oneplus", model: "Sandstone Bumper Case" },
      { brand: "anker", model: "MagGo Magnetic Case" },
      { brand: "samsung", model: "Galaxy Z Flip Case" },
      { brand: "apple", model: "iPhone FineWoven Case with MagSafe" },
      { brand: "baseus", model: "Transparent Shockproof Case" },
    ],
  },
  {
    name: "Screen Protectors",
    singular: "Screen Protector",
    slug: "screen-protectors",
    image: "https://cdn.faire.com/fastly/e3c0c2861ad5f9058173995a8d4268e5de7f31d6b9d09a605960c24d2e08115d.png?bg-color=FFFFFF&dpr=1&fit=crop&format=jpg&height=720&width=720",
    images: [
      "https://cdn.faire.com/fastly/e3c0c2861ad5f9058173995a8d4268e5de7f31d6b9d09a605960c24d2e08115d.png?bg-color=FFFFFF&dpr=1&fit=crop&format=jpg&height=720&width=720",
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/HQ3Y2?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1692791463870",
      "https://cdn.faire.com/fastly/e3c0c2861ad5f9058173995a8d4268e5de7f31d6b9d09a605960c24d2e08115d.png?bg-color=FFFFFF&dpr=1&fit=crop&format=jpg&height=720&width=720",
    ],
    basePrice: 390,
    keywords: ["glass", "protector", "screen"],
    attributes: ["compatibility", "material", "warranty_months", "pack_size", "phone_model"],
    names: [
      { brand: "apple", model: "Belkin UltraGlass Screen Protector" },
      { brand: "samsung", model: "Galaxy S24 Anti-Reflecting Film" },
      { brand: "baseus", model: "0.3mm Tempered Glass Protector" },
      { brand: "ugreen", model: "Privacy Tempered Glass Protector" },
      { brand: "xiaomi", model: "Redmi Note Tempered Glass" },
      { brand: "oneplus", model: "3D Tempered Glass Protector" },
      { brand: "anker", model: "Eufy SmartTrack Glass Tag Protector" },
      { brand: "samsung", model: "Galaxy Z Flip Cover Screen Film" },
      { brand: "apple", model: "iPhone Ceramic Shield Protector" },
      { brand: "baseus", model: "Camera Lens Glass Protector" },
    ],
  },
  {
    name: "Cables & Adapters",
    singular: "Cable & Adapter",
    slug: "cables-adapters",
    image: "https://se-cdn.djiits.com/tpc/uploads/in_the_box/cover/5793f03b9f69ef1535f73bdf459e8b53%40retina_small.png",
    images: [
      "https://se-cdn.djiits.com/tpc/uploads/in_the_box/cover/5793f03b9f69ef1535f73bdf459e8b53%40retina_small.png",
      "https://cdn.awsli.com.br/800x800/35/35541/produto/304708892/1-hna3omkd43.png",
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MUQ93?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1695246779451",
    ],
    basePrice: 490,
    keywords: ["cable", "adapter", "usb-c"],
    attributes: ["compatibility", "cable_length_m", "output_wattage", "warranty_months", "color", "connector"],
    names: [
      { brand: "apple", model: "USB-C Charge Cable 1m" },
      { brand: "anker", model: "PowerLine III USB-C Cable" },
      { brand: "ugreen", model: "100W USB-C Braided Cable" },
      { brand: "baseus", model: "Cafule USB-C Cable" },
      { brand: "samsung", model: "USB-C to USB-C Cable" },
      { brand: "xiaomi", model: "6A USB-C Cable" },
      { brand: "oneplus", model: "SUPERVOOC USB-C Cable" },
      { brand: "apple", model: "USB-C to Lightning Adapter" },
      { brand: "ugreen", model: "USB-C to 3.5mm Audio Adapter" },
      { brand: "baseus", model: "USB-C Hub Adapter" },
    ],
  },
  {
    name: "Earbuds & Headphones",
    singular: "Earbuds",
    slug: "earbuds-headphones",
    image: "https://static.wixstatic.com/media/c22c23_0fa2a9bb97f443658acb747221ff337b~mv2.jpg/v1/fill/w_980%2Ch_980%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/c22c23_0fa2a9bb97f443658acb747221ff337b~mv2.jpg",
    images: [
      "https://static.wixstatic.com/media/c22c23_0fa2a9bb97f443658acb747221ff337b~mv2.jpg/v1/fill/w_980%2Ch_980%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/c22c23_0fa2a9bb97f443658acb747221ff337b~mv2.jpg",
      "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MTJV3?wid=572&hei=572&fmt=jpeg&qlt=95&.v=1694014871985",
      "https://static.wixstatic.com/media/c22c23_0fa2a9bb97f443658acb747221ff337b~mv2.jpg/v1/fill/w_980%2Ch_980%2Cal_c%2Cq_85%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/c22c23_0fa2a9bb97f443658acb747221ff337b~mv2.jpg",
    ],
    basePrice: 2490,
    keywords: ["earbuds", "headphones", "audio"],
    attributes: ["compatibility", "connectivity", "battery_life", "water_resistance", "warranty_months", "noise_cancelling", "color"],
    names: [
      { brand: "apple", model: "AirPods Pro 2nd Generation" },
      { brand: "samsung", model: "Galaxy Buds FE" },
      { brand: "sony", model: "WF-C700N Earbuds" },
      { brand: "jbl", model: "Tune Beam Earbuds" },
      { brand: "oneplus", model: "Buds 3 Earbuds" },
      { brand: "xiaomi", model: "Redmi Buds 5 Pro" },
      { brand: "anker", model: "Soundcore Liberty 4 NC" },
      { brand: "baseus", model: "Bowie MA10 Earbuds" },
      { brand: "ugreen", model: "HiTune T6 Earbuds" },
      { brand: "logitech", model: "Zone True Wireless Earbuds" },
    ],
  },
  {
    name: "Car Accessories",
    singular: "Car Accessory",
    slug: "car-accessories",
    image: "https://s.alicdn.com/%40sc04/kf/H618452a4f21c4ad9ae2a4c2d82bccbf4k/Universal-Car-Air-Vent-Phone-Mount-Long-Arm-Strong-Suction-Solid-Durable-Universal-Cell-Phone-Holder-for-Car.jpg",
    images: [
      "https://s.alicdn.com/%40sc04/kf/H618452a4f21c4ad9ae2a4c2d82bccbf4k/Universal-Car-Air-Vent-Phone-Mount-Long-Arm-Strong-Suction-Solid-Durable-Universal-Cell-Phone-Holder-for-Car.jpg",
      "https://s.alicdn.com/%40sc04/kf/H618452a4f21c4ad9ae2a4c2d82bccbf4k/Universal-Car-Air-Vent-Phone-Mount-Long-Arm-Strong-Suction-Solid-Durable-Universal-Cell-Phone-Holder-for-Car.jpg",
      "https://s.alicdn.com/%40sc04/kf/H618452a4f21c4ad9ae2a4c2d82bccbf4k/Universal-Car-Air-Vent-Phone-Mount-Long-Arm-Strong-Suction-Solid-Durable-Universal-Cell-Phone-Holder-for-Car.jpg",
    ],
    basePrice: 790,
    keywords: ["car", "mount", "charger"],
    attributes: ["compatibility", "output_wattage", "material", "mount_type", "warranty_months", "color", "connector"],
    names: [
      { brand: "anker", model: "PowerDrive III Duo Car Charger" },
      { brand: "baseus", model: "Gravity Car Phone Holder" },
      { brand: "ugreen", model: "Magnetic Car Phone Mount" },
      { brand: "samsung", model: "Dual Port Car Charger" },
      { brand: "apple", model: "MagSafe Car Vent Mount" },
      { brand: "xiaomi", model: "Wireless Car Charger 50W" },
      { brand: "oneplus", model: "Warp Charge Car Charger" },
      { brand: "anker", model: "613 Magnetic Wireless Car Charger" },
      { brand: "baseus", model: "Metal Age Gravity Car Mount" },
      { brand: "ugreen", model: "Bluetooth Car Aux Adapter" },
    ],
  },
];

function isLocalDatabase(uri) {
  return /^mongodb:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/)/.test(uri);
}

function brandLogoUrl(website) {
  const domain = new URL(website).hostname.replace(/^www\./, "");
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
}

function categoryImage(category, offset = 0) {
  return category.images[offset % category.images.length];
}

function slugToken(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function skuToken(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);
}

function choose(values, index) {
  return values[index % values.length];
}

function money(value) {
  return Math.round(value / 10) * 10;
}

function stockFor(index, outOfStock = false) {
  if (outOfStock) {
    return {
      quantity: 0,
      trackInventory: true,
      allowBackorder: false,
      lowStockThreshold: 5,
      status: STOCK_STATUS.OUT_OF_STOCK,
    };
  }

  if (index % 17 === 0) {
    return {
      quantity: 0,
      trackInventory: true,
      allowBackorder: true,
      lowStockThreshold: 5,
      status: STOCK_STATUS.BACKORDER,
    };
  }

  if (index % 13 === 0) {
    return {
      quantity: 0,
      trackInventory: false,
      allowBackorder: false,
      lowStockThreshold: 5,
      status: STOCK_STATUS.IN_STOCK,
    };
  }

  const quantity = index % 9 === 0 ? 2 : 12 + ((index * 7) % 64);

  return {
    quantity,
    trackInventory: true,
    allowBackorder: false,
    lowStockThreshold: 5,
    status: STOCK_STATUS.IN_STOCK,
  };
}

function shippingFor(categorySlug, index) {
  const heavier = ["power-banks", "car-accessories"].includes(categorySlug);
  return {
    requiresShipping: true,
    freeShipping: index % 4 === 0,
    weight: { value: heavier ? 0.35 + (index % 4) * 0.08 : 0.08 + (index % 5) * 0.03, unit: "kg" },
    dimensions: {
      length: heavier ? 16 : 10,
      width: heavier ? 9 : 7,
      height: heavier ? 4 : 2,
      unit: "cm",
    },
  };
}

function productAttributeOptions(categorySlug, index) {
  const compatibilitySets = [
    ["android", "ios"],
    ["android", "usb-c"],
    ["ios", "magsafe"],
    ["bluetooth", "android", "ios"],
    ["usb-c", "android", "ios"],
  ];
  const options = {
    compatibility: choose(compatibilitySets, index),
    warranty_months: choose([6, 12, 18, 24], index),
  };

  if (["neckbands", "smart-watches", "earbuds-headphones"].includes(categorySlug)) {
    options.connectivity = choose(["bluetooth-5-0", "bluetooth-5-2", "bluetooth-5-3"], index);
    options.battery_life = choose([18, 24, 32, 40, 60], index);
    options.water_resistance = choose(["none", "ipx4", "ipx5", "ip67"], index);
    options.noise_cancelling = choose(["none", "enc", "anc"], index);
  }

  if (categorySlug === "microphones") {
    options.connectivity = choose(["wired", "wireless-2-4ghz", "bluetooth"], index);
    options.microphone_pattern = choose(["omnidirectional", "cardioid", "dual-channel"], index);
  }

  if (["chargers", "cables-adapters", "car-accessories"].includes(categorySlug)) {
    options.output_wattage = choose([18, 20, 25, 33, 45, 65, 100], index);
  }

  if (categorySlug === "power-banks") {
    options.capacity_mah = choose([5000, 10000, 12000, 20000, 30000], index);
    options.output_wattage = choose([18, 20, 22, 30, 45, 65], index);
  }

  if (["phone-cases", "screen-protectors", "car-accessories"].includes(categorySlug)) {
    options.material = choose(["silicone", "polycarbonate", "tempered-glass", "aluminum", "vegan-leather"], index);
  }

  if (categorySlug === "cables-adapters") {
    options.cable_length_m = choose([0.25, 1, 1.5, 2, 3], index);
  }

  if (categorySlug === "car-accessories") {
    options.mount_type = choose(["dashboard", "air-vent", "windshield", "cup-holder", "seat-back"], index);
  }

  return options;
}

function groupedAttributes(options) {
  const highlightKeys = [
    "compatibility",
    "connectivity",
    "battery_life",
    "capacity_mah",
    "output_wattage",
    "cable_length_m",
  ];
  const highlights = {};
  const details = {};

  for (const [key, value] of Object.entries(options)) {
    if (highlightKeys.includes(key)) highlights[key] = value;
    else details[key] = value;
  }

  return [
    Object.keys(highlights).length ? { title: "Highlights", options: highlights } : null,
    Object.keys(details).length ? { title: "Details", options: details } : null,
  ].filter(Boolean);
}

function variationOptionsFor(categorySlug, index) {
  const colors = [
    ["black", "blue", "silver"],
    ["black", "white", "green"],
    ["graphite", "pink", "navy"],
    ["black", "red", "purple"],
  ];

  if (["phone-cases", "screen-protectors"].includes(categorySlug)) {
    return {
      phone_model: ["iphone-15", "galaxy-s24", "pixel-9"],
      ...(categorySlug === "phone-cases" ? { color: choose(colors, index) } : { pack_size: ["1-pack", "2-pack"] }),
    };
  }

  if (categorySlug === "smart-watches") {
    return { color: choose(colors, index), strap_size: ["small-medium", "large"] };
  }

  if (["microphones", "chargers", "cables-adapters", "car-accessories"].includes(categorySlug)) {
    return { connector: ["usb-c", "lightning"], color: choose(colors, index).slice(0, 2) };
  }

  return { color: choose(colors, index) };
}

function cartesian(entries) {
  return entries.reduce(
    (combinations, [key, values]) => combinations.flatMap((item) => values.map((value) => ({ ...item, [key]: value }))),
    [{}]
  );
}

function seoFor(name, slug, tags, image) {
  const description = `${name} for mobile shoppers who need dependable accessories with clear specs, working stock data and useful filters.`;
  return {
    title: name.slice(0, 70),
    description: description.slice(0, 320),
    keywords: [...new Set(tags)].slice(0, 30),
    canonicalUrl: `https://gadgetsimp.dev/products/${slug}`,
    noIndex: false,
    noFollow: false,
    ogTitle: name.slice(0, 95),
    ogDescription: description.slice(0, 300),
    ogImage: image.src,
    twitterTitle: name.slice(0, 70),
    twitterDescription: description.slice(0, 200),
    twitterImage: image.src,
  };
}

async function clearSeededData() {
  await Promise.all([
    Variant.deleteMany({}),
    Product.deleteMany({}),
    Category.deleteMany({}),
    Brand.deleteMany({}),
    Attribute.deleteMany({}),
    Cart.deleteMany({}),
    Wishlist.deleteMany({}),
    Order.deleteMany({}),
    Media.deleteMany({}),
    User.deleteMany({}),
    PendingRegistration.deleteMany({}),
    Counter.deleteMany({}),
  ]);
}

async function seedUsers() {
  const owner = await User.create({
    fullName: "Site Owner",
    email: "owner@gadgetsimp.dev",
    password: "Owner1234",
    role: ROLES.OWNER,
    status: USER_STATUS.ACTIVE,
    emailVerifiedAt: new Date(),
  });

  const admin = await User.create({
    fullName: "Store Admin",
    email: "admin@gadgetsimp.dev",
    password: "Admin1234",
    role: ROLES.ADMIN,
    emailVerifiedAt: new Date(),
  });

  await User.create({
    fullName: "Mina Rahman",
    email: "moderator@gadgetsimp.dev",
    password: "Moderator1234",
    role: ROLES.MODERATOR,
    emailVerifiedAt: new Date(),
  });

  await User.create({
    fullName: "Raju Ahmed",
    email: "customer@gadgetsimp.dev",
    password: "Customer1234",
    role: ROLES.CUSTOMER,
    phone: "+8801712345678",
    emailVerifiedAt: new Date(),
  });

  await User.create({
    fullName: "Google Demo Customer",
    email: "google.customer@gadgetsimp.dev",
    authProviders: [AUTH_PROVIDERS.GOOGLE],
    socialAccounts: [{ provider: AUTH_PROVIDERS.GOOGLE, providerId: "seed-google-customer" }],
    role: ROLES.CUSTOMER,
    emailVerifiedAt: new Date(),
  });

  return { owner, admin };
}

async function seedBrands(actor) {
  const brands = await Brand.insertMany(
    brandsSeed.map(([name, slug, description, website]) => ({
      name,
      slug,
      description,
      logo: brandLogoUrl(website),
      website,
      status: CATALOG_STATUS.ACTIVE,
      visibility: VISIBILITY.PUBLIC,
      publishedAt,
      seo: {
        title: `${name} mobile accessories`,
        description,
        keywords: [slug, "mobile-accessories", "gadgets"],
      },
      createdBy: actor.id,
      updatedBy: actor.id,
    }))
  );

  return new Map(brands.map((brand) => [brand.slug, brand]));
}

async function seedAttributes(actor) {
  const attributes = await Attribute.insertMany(
    attributeSeeds.map(([name, key, slug, source, type, min, max]) => ({
      name,
      key,
      slug,
      description: `${name} filter for the mobile accessories catalog.`,
      source,
      type,
      min,
      max,
      status: CATALOG_STATUS.ACTIVE,
      display: {
        helpText: `Filter products by ${name.toLowerCase()}.`,
        showInProductDetails: true,
      },
      createdBy: actor.id,
      updatedBy: actor.id,
    }))
  );

  return new Map(attributes.map((attribute) => [attribute.key, attribute]));
}

async function seedCategories(attributeByKey, actor) {
  const categories = await Category.insertMany(
    categorySeeds.map((category, index) => ({
      name: category.name,
      slug: category.slug,
      description: `Shop ${category.name.toLowerCase()} for mobile-first setups, daily carry and creator workflows.`,
      status: CATALOG_STATUS.ACTIVE,
      visibility: VISIBILITY.PUBLIC,
      image: category.image,
      showInHome: true,
      sortOrder: index,
      attributes: category.attributes.map((key) => attributeByKey.get(key)._id),
      seo: {
        title: category.name,
        description: `Mobile ${category.name.toLowerCase()} with filterable specs and ready stock data.`,
        keywords: [category.slug, ...category.keywords],
      },
      createdBy: actor.id,
      updatedBy: actor.id,
    }))
  );

  return new Map(categories.map((category) => [category.slug, category]));
}

async function seedProducts(categoryBySlug, brandBySlug, actor) {
  const products = [];
  const productMeta = new Map();
  const variants = [];
  let productNumber = 0;
  let imageId = 1000;

  for (const [categoryIndex, category] of categorySeeds.entries()) {
    const categoryDoc = categoryBySlug.get(category.slug);

    for (const [itemIndex, productLine] of category.names.entries()) {
      productNumber += 1;

      const brand = brandBySlug.get(productLine.brand);
      if (!brand) throw new Error(`Seed product references unknown brand: ${productLine.brand}`);
      const isVariable = itemIndex < 4;
      const isOutOfStock = itemIndex === 9;
      const name = `${brand.name} ${productLine.model}`;
      const slug = slugToken(`${brand.slug}-${productLine.model}-${category.slug}`);
      const sku = `GS-${skuToken(category.slug)}-${String(itemIndex + 1).padStart(2, "0")}`;
      const thumbnail = { id: imageId++, alt: name, src: categoryImage(category, itemIndex) };
      const tags = [
        category.slug,
        ...category.keywords,
        brand.slug,
        isVariable ? "with-variation" : "without-variation",
        isOutOfStock ? "stock-out" : "in-stock",
        "mobile",
        "similar-products",
      ];
      const sellingPrice = money(category.basePrice + itemIndex * 210 + categoryIndex * 75);
      const product = {
        name,
        slug,
        description: `${name} is a realistic seed product for the GadgetSimp mobile catalog. It includes brand, category, price, stock, images, grouped attributes and related tags so listing, filtering, detail pages, carts and wishlist flows can be tested end to end.`,
        shortDescription: `${category.name} by ${brand.name}, ready for mobile accessory listings and filters.`,
        categoryIds: [categoryDoc._id],
        brandId: brand._id,
        productType: isVariable ? PRODUCT_TYPE.VARIABLE : PRODUCT_TYPE.SIMPLE,
        sku,
        status: isOutOfStock ? PRODUCT_STATUS.OUT_OF_STOCK : PRODUCT_STATUS.ACTIVE,
        visibility: PRODUCT_VISIBILITY.PUBLIC,
        featured: productNumber % 7 === 0 || itemIndex === 0,
        tags,
        attributes: groupedAttributes(productAttributeOptions(category.slug, productNumber)),
        variantOptionKeys: isVariable ? Object.keys(variationOptionsFor(category.slug, productNumber)) : [],
        currency: "BDT",
        sellingPrice,
        originalPrice: productNumber % 3 === 0 ? sellingPrice + choose([300, 500, 800, 1200], productNumber) : undefined,
        stock: stockFor(productNumber, isOutOfStock),
        shipping: shippingFor(category.slug, productNumber),
        thumbnail,
        images: [
          { id: imageId++, alt: `${name} front view`, src: categoryImage(category, itemIndex + 1) },
          { id: imageId++, alt: `${name} detail view`, src: categoryImage(category, itemIndex + 2) },
        ],
        publishedAt,
        createdBy: actor.id,
        updatedBy: actor.id,
      };
      product.seo = seoFor(product.name, product.slug, product.tags, product.thumbnail);
      products.push(product);
      productMeta.set(product.slug, { categorySlug: category.slug, seedIndex: productNumber });
    }
  }

  const createdProducts = await Product.insertMany(products, { ordered: true });

  for (const product of createdProducts) {
    if (product.productType !== PRODUCT_TYPE.VARIABLE) continue;

    const meta = productMeta.get(product.slug);
    const optionSets = variationOptionsFor(meta.categorySlug, meta.seedIndex);
    const combinations = cartesian(Object.entries(optionSets));
    const parentOutOfStock = product.status === PRODUCT_STATUS.OUT_OF_STOCK;

    for (const [index, options] of combinations.entries()) {
      const suffix = Object.values(options).map(skuToken).join("-");
      const variantOutOfStock = parentOutOfStock || index === combinations.length - 1;
      const variantPrice = money(product.sellingPrice + index * 80);

      variants.push({
        productId: product._id,
        sku: `${product.sku}-${suffix}`,
        options,
        sellingPrice: variantPrice,
        originalPrice: product.originalPrice ? product.originalPrice + index * 80 : undefined,
        stock: stockFor(index + 1, variantOutOfStock),
        status: variantOutOfStock ? PRODUCT_STATUS.OUT_OF_STOCK : PRODUCT_STATUS.ACTIVE,
        image: {
          id: imageId++,
          alt: `${product.name} ${Object.values(options).join(" ")}`,
          src: categoryImage(categorySeeds.find((item) => item.slug === meta.categorySlug), index),
        },
        weight: product.shipping.weight,
        dimensions: product.shipping.dimensions,
        sortOrder: index,
        createdBy: actor.id,
        updatedBy: actor.id,
      });
    }
  }

  await Variant.insertMany(variants, { ordered: true });

  return { products: createdProducts, variants };
}

async function seedDatabase(log = logger) {
  log.info("Clearing users, auth state, media and catalog data");
  await clearSeededData();

  const { owner, admin } = await seedUsers();
  const brandBySlug = await seedBrands(owner);
  const attributeByKey = await seedAttributes(owner);
  const categoryBySlug = await seedCategories(attributeByKey, owner);
  const { products, variants } = await seedProducts(categoryBySlug, brandBySlug, owner);

  log.info(
    {
      users: 5,
      brands: brandBySlug.size,
      categories: categoryBySlug.size,
      attributes: attributeByKey.size,
      products: products.length,
      variations: variants.length,
    },
    "Seed complete"
  );

  log.info(`Owner     : owner@gadgetsimp.dev / Owner1234 (id ${owner.id})`);
  log.info(`Admin     : admin@gadgetsimp.dev / Admin1234 (id ${admin.id})`);
  log.info("Moderator : moderator@gadgetsimp.dev / Moderator1234");
  log.info("Customer  : customer@gadgetsimp.dev / Customer1234");
  log.info("Google demo customer: google.customer@gadgetsimp.dev (social-only)");

  return {
    users: 5,
    brands: brandBySlug.size,
    categories: categoryBySlug.size,
    attributes: attributeByKey.size,
    products: products.length,
    variations: variants.length,
  };
}

async function seed() {
  if (env.isProduction) {
    throw new Error("Refusing to seed a production database");
  }

  if (!isLocalDatabase(env.MONGODB_URI) && process.env.SEED_CONFIRM !== "yes") {
    const target = env.MONGODB_URI.replace(/\/\/[^@]*@/, "//<credentials>@");

    throw new Error(
      [
        "Refusing to seed a non-local database.",
        `  Target: ${target}`,
        "",
        "This script DELETES users, auth state, media, carts, wishlists, orders and catalog data.",
        "If that is genuinely what you want, re-run with:",
        "",
        "  SEED_CONFIRM=yes npm run seed",
      ].join("\n")
    );
  }

  await connectDatabase();

  // The seed relies on unique indexes to catch duplicate slugs, SKUs and
  // emails, so build them before writing anything.
  await ensureIndexes();
  await seedDatabase(logger);
}

if (require.main === module) {
  seed()
    .then(async () => {
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.fatal({ err: error }, "Seed failed");
      await mongoose.connection.close().catch(() => {});
      process.exit(1);
    });
}

module.exports = { isLocalDatabase, seedDatabase };
