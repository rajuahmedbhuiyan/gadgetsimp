"use strict";

/**
 * Writes the generated OpenAPI document to openapi.json.
 *
 * Useful for generating a typed frontend client, diffing the contract in CI
 * to catch unintended breaking changes, or importing into Postman.
 *
 *   npm run docs:export
 */

const fs = require("node:fs");
const path = require("node:path");
const { buildSpec } = require("../src/config/swagger");

const spec = buildSpec();
const outputPath = path.join(__dirname, "..", "openapi.json");

fs.writeFileSync(outputPath, `${JSON.stringify(spec, null, 2)}\n`);

const pathCount = Object.keys(spec.paths ?? {}).length;
const operationCount = Object.values(spec.paths ?? {}).reduce(
  (total, item) =>
    total + Object.keys(item).filter((key) => key !== "parameters").length,
  0
);

console.log(`Wrote ${outputPath}`);
console.log(`${pathCount} paths, ${operationCount} operations`);
