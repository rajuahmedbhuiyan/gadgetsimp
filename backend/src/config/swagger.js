"use strict";

const path = require("node:path");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const env = require("./env");
const logger = require("./logger");

/**
 * OpenAPI spec assembly.
 *
 * The spec is generated from JSDoc `@openapi` blocks that live inside each
 * feature module (`*.docs.js`), not from one central hand-maintained YAML.
 * A central file is always out of date within a month; docs that sit beside
 * the route they describe get edited in the same pull request as the route.
 */

const definition = {
  openapi: "3.0.3",
  info: {
    title: "GadgetSimp Commerce API",
    version: "1.0.0",
    description: [
      "REST API for the GadgetSimp storefront: catalog, cart, checkout and order management.",
      "",
      "### Authentication",
      "Send the short-lived access token as `Authorization: Bearer <token>`.",
      "The refresh token is issued as an httpOnly cookie and is rotated on every use.",
      "",
      "### Response envelope",
      "Every response - success or failure - uses the same shape, so clients need one parser:",
      "```json",
      '{ "success": true, "message": "...", "data": {}, "meta": {} }',
      "```",
      "",
      "### Rate limiting",
      "Endpoints are grouped into tiers with separate budgets. Every response carries",
      "`RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` headers; a `429`",
      "additionally carries `Retry-After` (seconds).",
    ].join("\n"),
    contact: { name: "GadgetSimp API Support", email: "api@gadgetsimp.dev" },
    license: { name: "ISC" },
  },
  servers: [
    { url: `http://localhost:${env.PORT}${env.API_PREFIX}`, description: "Local" },
    { url: `https://api.gadgetsimp.dev${env.API_PREFIX}`, description: "Production" },
  ],
  // Only tags with operations behind them. Declaring a tag before its module
  // exists renders an empty section in Swagger UI, which reads as a broken
  // spec rather than a roadmap - add each tag with its module.
  tags: [
    { name: "Health", description: "Liveness and readiness probes" },
    { name: "Auth", description: "Registration, login, token rotation, logout" },
    { name: "Users", description: "Profile management and admin user administration" },
    { name: "Media", description: "Cloudinary-backed file uploads" },
    { name: "Products", description: "Public catalog discovery and admin product management" },
    { name: "Categories", description: "Hierarchical catalog taxonomy and attribute configuration" },
    { name: "Brands", description: "Global product brands" },
    { name: "Attributes", description: "Reusable metadata-driven catalog attributes" },
    { name: "Variations", description: "Generated purchasable SKUs, pricing and stock" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Paste the `accessToken` returned by `/auth/login`.",
      },
    },
  },
  // Secure by default: individual public operations opt out with `security: []`.
  security: [{ bearerAuth: [] }],
};

const options = {
  definition,
  apis: [
    // Shared components ($ref targets) must be scanned alongside the
    // operations that reference them.
    path.join(__dirname, "..", "docs", "*.js"),
    path.join(__dirname, "..", "modules", "**", "*.docs.js"),
    // Top-level routes that are not part of a feature module, e.g. /health.
    path.join(__dirname, "..", "routes", "*.js"),
  ],
};

function buildSpec() {
  return swaggerJsdoc(options);
}

/**
 * Forces the docs page to render light, whatever the viewer's OS, browser or
 * extensions would otherwise do.
 *
 * Swagger UI's own stylesheet has no dark theme - it carries no
 * `prefers-color-scheme` rules at all. A dark docs page is therefore always
 * something outside the page inverting it, and there are three separate
 * mechanisms to shut off, which is why a background override alone is not
 * enough:
 *
 *   1. `color-scheme: only light` - the `only` keyword is the difference
 *      between a hint and a rule. Plain `light` merely states a preference
 *      that Chrome's auto-dark-mode may still override; `only` forbids the
 *      user-agent from applying its own transform, and keeps scrollbars,
 *      dropdowns and the "Try it out" inputs light too.
 *   2. `<meta name="color-scheme" content="light">` - applies before the
 *      stylesheet loads, so there is no dark flash on first paint.
 *   3. `<meta name="darkreader-lock">` - Dark Reader ignores CSS entirely by
 *      design; this is the documented tag that tells it to leave a page alone.
 */
const FORCE_LIGHT_THEME_CSS = `
  :root, html { color-scheme: only light; }
  html, body, .swagger-ui { background: #fafafa; }
  .swagger-ui, .swagger-ui .info .title, .swagger-ui .info li,
  .swagger-ui .info p, .swagger-ui .info table { color: #3b4151; }
  .swagger-ui .scheme-container { background: #fff; }
  .swagger-ui select, .swagger-ui input, .swagger-ui textarea {
    background: #fff; color: #3b4151;
  }
`;

const FORCE_LIGHT_META_TAGS = [
  '<meta name="color-scheme" content="light">',
  '<meta name="supported-color-schemes" content="light">',
  "<meta name=\"darkreader-lock\">",
].join("\n  ");

function mountSwagger(app) {
  if (!env.SWAGGER_ENABLED) {
    logger.info("Swagger UI disabled (SWAGGER_ENABLED=false)");
    return;
  }

  const spec = buildSpec();
  const docsPath = `${env.API_PREFIX}/docs`;

  // Raw spec, for client generators and CI contract checks.
  app.get(`${docsPath}.json`, (req, res) => {
    res.json(spec);
  });

  const uiOptions = {
    customSiteTitle: "GadgetSimp API Docs",
    customCss: FORCE_LIGHT_THEME_CSS,
    swaggerOptions: {
      persistAuthorization: true, // keep the bearer token across reloads
      // Without this, "Try it out" sends no cookies, so /auth/refresh always
      // answers REFRESH_TOKEN_MISSING and the refresh flow looks broken when
      // it is only untestable.
      withCredentials: true,
      displayRequestDuration: true,
      docExpansion: "none",
      filter: true,
      tryItOutEnabled: true,
    },
  };

  // The page is generated once and patched, rather than served straight from
  // `swaggerUi.setup`, because `setup` exposes no way to add anything to
  // <head> - and the meta tags that pin the colour scheme have to be there,
  // ahead of the stylesheet, to work.
  const html = swaggerUi
    .generateHTML(spec, uiOptions)
    .replace("<head>", `<head>\n  ${FORCE_LIGHT_META_TAGS}`);

  app.use(docsPath, swaggerUi.serveFiles(spec, uiOptions), (req, res) => {
    res.type("html").send(html);
  });

  logger.info(`Swagger UI mounted at ${docsPath}`);
}

module.exports = { mountSwagger, buildSpec };
