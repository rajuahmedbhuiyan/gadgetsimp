"use strict";

/**
 * Writes FRONTEND-INSTRUCTIONS.md - the single document the frontend builds
 * against.
 *
 * **Generated from the OpenAPI spec, never hand-written.** There are 91
 * operations; a hand-maintained copy would be wrong within a week, and the
 * whole point of this file is that it can be trusted. The spec is already
 * guarded against drift by `tests/docs.test.js`, so deriving from it inherits
 * those guarantees instead of opening a second source of truth.
 *
 *   npm run docs:frontend
 *   npm run docs:frontend -- --out=path.md
 *
 * `$ref`s are followed and `allOf` is flattened here, so no field stays hidden
 * behind schema composition.
 */

const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV ??= "development";
process.env.LOG_LEVEL ??= "silent";

const { buildSpec } = require("../src/config/swagger");
const { GUIDE } = require("./frontend-guide");

/* ------------------------------ spec helpers ------------------------------ */

function makeResolver(spec) {
  const seen = new Set();

  function resolve(schema, depth = 0) {
    if (!schema || depth > 12) return schema ?? {};

    if (schema.$ref) {
      const name = schema.$ref.split("/").pop();
      if (seen.has(name)) return { type: "object", description: `(recursive ${name})` };
      seen.add(name);
      const target = resolve(spec.components?.schemas?.[name], depth + 1);
      seen.delete(name);
      return { ...target, __name: name };
    }

    if (schema.allOf) {
      const properties = {};
      const required = [];
      let rest = {};

      for (const part of schema.allOf) {
        // Pull properties/required out before merging, or the spread below
        // overwrites the accumulator with the last part's (often absent) copy.
        const { properties: own, required: ownRequired, ...others } = resolve(part, depth + 1);
        Object.assign(properties, own ?? {});
        required.push(...(ownRequired ?? []));
        rest = { ...rest, ...others };
      }

      return { ...rest, type: "object", properties, required };
    }

    return schema;
  }

  return resolve;
}

function typeLabel(schema, resolve, depth = 0) {
  if (depth > 6) return "any";
  const node = resolve(schema);

  if (node.oneOf || node.anyOf) {
    const parts = [
      ...new Set((node.oneOf ?? node.anyOf).map((option) => typeLabel(option, resolve, depth + 1))),
    ];

    /**
     * "one value or several" is spelt `oneOf: [enum, enum[]]`, which would
     * otherwise print the whole enum twice. Collapse the array form into a
     * suffix on the scalar one.
     */
    const arrays = new Set(parts.filter((part) => part.endsWith("[]")));

    const collapsed = parts
      .filter((part) => !part.endsWith("[]"))
      .map((part) => (arrays.has(`${part}[]`) ? `${part} *(or array)*` : part));

    for (const part of arrays) {
      if (!parts.includes(part.slice(0, -2))) collapsed.push(part);
    }

    return collapsed.join(" \\| ");
  }

  if (node.type === "array") return `${typeLabel(node.items ?? {}, resolve, depth + 1)}[]`;
  if (node.enum) return node.enum.map((value) => `\`${value}\``).join(" \\| ");

  return node.type ?? (node.properties ? "object" : "any");
}

/**
 * Flattens a body schema into table rows.
 *
 * Nested objects become dotted paths and array items get `[]`, because that is
 * how the access is written anyway: `contact.name`, `items[].quantity`.
 */
function fieldRows(schema, resolve, prefix = "", depth = 0) {
  const node = resolve(schema);
  const rows = [];

  if (depth > 4) return rows;

  if (node.type === "array" && node.items) {
    return fieldRows(node.items, resolve, `${prefix}[]`, depth + 1);
  }

  const own = new Set(node.required ?? []);

  for (const [name, raw] of Object.entries(node.properties ?? {})) {
    const child = resolve(raw);
    const key = prefix ? `${prefix}.${name}` : name;

    const constraints = [
      child.minimum != null ? `min ${child.minimum}` : null,
      child.maximum != null ? `max ${child.maximum}` : null,
      child.minLength != null ? `minLength ${child.minLength}` : null,
      child.maxLength != null ? `maxLength ${child.maxLength}` : null,
      child.minItems != null ? `minItems ${child.minItems}` : null,
      child.maxItems != null ? `maxItems ${child.maxItems}` : null,
    ].filter(Boolean);

    rows.push({
      name: key,
      type: typeLabel(raw, resolve),
      required: own.has(name),
      notes: [
        child.description ? clean(child.description) : "",
        child.default !== undefined ? `Default \`${JSON.stringify(child.default)}\`.` : "",
        constraints.length ? `${constraints.join(", ")}.` : "",
        child.nullable ? "Nullable." : "",
      ]
        .filter(Boolean)
        .join(" "),
    });

    const nested = child.type === "array" ? resolve(child.items ?? {}) : child;
    if (nested.properties || (nested.type === "array" && nested.items)) {
      rows.push(...fieldRows(raw, resolve, key, depth + 1));
    }
  }

  return rows;
}

function bodyExample(media) {
  if (!media) return null;
  if (media.example !== undefined) return media.example;
  const named = Object.values(media.examples ?? {});
  return named.length > 0 ? named[0].value : null;
}

function namedExamples(media) {
  return Object.entries(media?.examples ?? {}).map(([key, value]) => ({
    summary: value.summary ?? key,
    value: value.value,
  }));
}

/**
 * Who may call this. `security: []` is the spec's own public marker; the role,
 * where one applies, is read out of the operation's prose rather than kept in
 * a second hand-maintained list that could disagree with it.
 */
function accessFor(operation) {
  if (Array.isArray(operation.security) && operation.security.length === 0) return "Public";

  const text = `${operation.summary ?? ""} ${operation.description ?? ""}`;

  if (/\bOWNER\b/.test(text)) return "Owner only";
  if (/ADMIN and above|\bADMIN\b/.test(text)) return "Admin and above";
  if (/MODERATOR and above|\bMODERATOR\b/.test(text)) return "Moderator and above";

  return "Any signed-in user";
}

/** Collapses the spec's folded prose into single-line paragraphs. */
function clean(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

const LIST_ITEM = /^\s*([-*]|\d+\.)\s+/;

/**
 * Splits folded spec prose into blocks.
 *
 * A block that contains list items keeps its line breaks - collapsing them
 * runs "1. … 2. … 3. …" into one unreadable paragraph, and those lists are
 * usually the step-by-step flows that matter most.
 */
function paragraphs(text) {
  if (!text) return [];

  return String(text)
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split("\n");

      if (!lines.some((line) => LIST_ITEM.test(line))) return clean(block);

      // Join continuation lines onto the item they belong to, so a wrapped
      // bullet stays one bullet.
      const items = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (LIST_ITEM.test(line) || items.length === 0) items.push(trimmed);
        else items[items.length - 1] += ` ${trimmed}`;
      }

      /**
       * YAML's `>` folding has usually already joined a bullet list into one
       * line by the time it reaches here, so "- a - b - c" arrives as a single
       * item. Split it back apart - but only on a separator followed by a
       * backtick, and only on a line that already starts as a bullet. The
       * prose in these docs uses " - " as an em-dash constantly, and a looser
       * rule would shred it.
       */
      return items
        .flatMap((item) =>
          /^[-*]\s/.test(item)
            ? item
                .split(/\s+[-*]\s+(?=`)/)
                .map((part, index) => (index === 0 ? part : `- ${part}`))
            : [item]
        )
        .join("\n");
    })
    .filter(Boolean);
}

/** Markdown tables break on a raw pipe or newline. */
const cell = (value) => clean(value).replaceAll("|", "\\|");

const anchor = (method, apiPath) =>
  `${method}-${apiPath}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* -------------------------------- rendering ------------------------------- */

function renderOperation(method, apiPath, operation, spec, resolve) {
  const out = [];
  const media = operation.requestBody?.content?.["application/json"];
  const multipart = operation.requestBody?.content?.["multipart/form-data"];

  out.push(`### \`${method.toUpperCase()} ${apiPath}\``);
  out.push("");
  out.push(`**Access:** ${accessFor(operation)}`);
  out.push("");

  if (operation.summary) {
    out.push(`${clean(operation.summary)}`);
    out.push("");
  }

  for (const block of paragraphs(operation.description)) {
    out.push(block);
    out.push("");
  }

  // Parameters may be `$ref`s into components - `#/components/parameters/UserIdPath`
  // - in which case `name` and `in` live on the target, not on the reference.
  const params = (operation.parameters ?? []).map((parameter) =>
    parameter.$ref
      ? spec.components?.parameters?.[parameter.$ref.split("/").pop()] ?? parameter
      : parameter
  );

  if (params.length > 0) {
    out.push("**Parameters**");
    out.push("");
    out.push("| Name | In | Type | Required | Notes |");
    out.push("| --- | --- | --- | --- | --- |");
    for (const parameter of params) {
      out.push(
        `| \`${parameter.name}\` | ${parameter.in} | ${typeLabel(parameter.schema ?? {}, resolve)} | ${
          parameter.required ? "**yes**" : "no"
        } | ${cell(parameter.description ?? "")}${
          parameter.example !== undefined ? ` e.g. \`${parameter.example}\`` : ""
        } |`
      );
    }
    out.push("");
  }

  if (multipart) {
    out.push("**Request body** — `multipart/form-data`, file on the `file` field.");
    out.push("");
  }

  if (media) {
    const rows = fieldRows(media.schema, resolve);

    if (rows.length > 0) {
      out.push("**Request body**");
      out.push("");
      out.push("| Field | Type | Required | Notes |");
      out.push("| --- | --- | --- | --- |");
      for (const row of rows) {
        out.push(`| \`${row.name}\` | ${row.type} | ${row.required ? "**yes**" : "no"} | ${cell(row.notes)} |`);
      }
      out.push("");
    }

    const example = bodyExample(media);
    if (example !== null && example !== undefined) {
      out.push("```json");
      out.push(JSON.stringify(example, null, 2));
      out.push("```");
      out.push("");
    }

    const extras = namedExamples(media);
    if (extras.length > 1) {
      for (const entry of extras.slice(1)) {
        out.push(`*${clean(entry.summary)}*`);
        out.push("");
        out.push("```json");
        out.push(JSON.stringify(entry.value, null, 2));
        out.push("```");
        out.push("");
      }
    }
  }

  const responses = Object.entries(operation.responses ?? {});
  if (responses.length > 0) {
    out.push("**Responses**");
    out.push("");
    out.push("| Status | Meaning |");
    out.push("| --- | --- |");
    for (const [code, response] of responses) {
      const resolved = response.$ref
        ? spec.components?.responses?.[response.$ref.split("/").pop()] ?? {}
        : response;
      out.push(`| \`${code}\` | ${cell(resolved.description ?? "")} |`);
    }
    out.push("");
  }

  out.push("---");
  out.push("");

  return out.join("\n");
}

function build(spec) {
  const resolve = makeResolver(spec);
  const groups = new Map();

  for (const [apiPath, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (method === "parameters") continue;
      const tag = operation.tags?.[0] ?? "Other";
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push({ method, apiPath, operation });
    }
  }

  // Follow the spec's declared tag order - it is the order the modules were
  // built in and reads as a sensible tour of the API.
  const ordered = [
    ...spec.tags.map((tag) => tag.name).filter((name) => groups.has(name)),
    ...[...groups.keys()].filter((name) => !spec.tags.some((tag) => tag.name === name)),
  ];

  const describe = new Map(spec.tags.map((tag) => [tag.name, tag.description]));
  const total = [...groups.values()].reduce((sum, list) => sum + list.length, 0);

  const out = [];

  out.push(GUIDE({ total, paths: Object.keys(spec.paths).length, version: spec.info.version }));

  /* --------------------------- endpoint index --------------------------- */

  out.push("## Endpoint index");
  out.push("");
  out.push("| Method | Path | Access | What it does |");
  out.push("| --- | --- | --- | --- |");
  for (const tag of ordered) {
    for (const { method, apiPath, operation } of groups.get(tag)) {
      out.push(
        `| \`${method.toUpperCase()}\` | [\`${apiPath}\`](#${anchor(method, apiPath)}) | ${accessFor(
          operation
        )} | ${cell(operation.summary ?? "")} |`
      );
    }
  }
  out.push("");
  out.push("---");
  out.push("");

  /* ---------------------------- the reference --------------------------- */

  out.push("# Endpoint reference");
  out.push("");

  for (const tag of ordered) {
    out.push(`## ${tag}`);
    out.push("");
    if (describe.get(tag)) {
      out.push(`${clean(describe.get(tag))}`);
      out.push("");
    }
    for (const { method, apiPath, operation } of groups.get(tag)) {
      out.push(renderOperation(method, apiPath, operation, spec, resolve));
    }
  }

  return { markdown: out.join("\n"), total, paths: Object.keys(spec.paths).length };
}

function main() {
  const outArgument = process.argv.slice(2).find((value) => value.startsWith("--out="));
  const outPath = outArgument
    ? path.resolve(outArgument.slice("--out=".length))
    : path.join(__dirname, "..", "FRONTEND-INSTRUCTIONS.md");

  const spec = buildSpec();
  const { markdown, total, paths } = build(spec);

  fs.writeFileSync(outPath, markdown);

  process.stdout.write(`Wrote ${outPath}\n  ${total} operations across ${paths} paths\n`);
}

if (require.main === module) main();

module.exports = { build, makeResolver, fieldRows, accessFor };
