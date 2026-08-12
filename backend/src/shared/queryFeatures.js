"use strict";

const { PAGINATION } = require("./constants");

/**
 * Turns already-validated query params into a Mongoose query.
 *
 * The important rule: `allowedFilters` and `allowedSortFields` are supplied by
 * the caller and nothing outside those lists reaches the database. A generic
 * "spread req.query into find()" helper is the classic way an API leaks
 * documents (`?role=admin`, `?isDeleted=false`) and lets a client sort on an
 * unindexed field to stall the cluster.
 */
class QueryFeatures {
  /**
   * @param {import("mongoose").Query} query A base query, e.g. Model.find().
   * @param {object} params Validated query params.
   * @param {object} options
   * @param {string[]} options.allowedFilters Fields a client may filter on.
   * @param {string[]} options.allowedSortFields Fields a client may sort by.
   * @param {string} [options.defaultSort] Fallback sort spec.
   */
  constructor(query, params = {}, { allowedFilters = [], allowedSortFields = [], defaultSort = "-createdAt" } = {}) {
    this.query = query;
    this.params = params;
    this.allowedFilters = new Set(allowedFilters);
    this.allowedSortFields = new Set(allowedSortFields);
    this.defaultSort = defaultSort;
    this.page = PAGINATION.DEFAULT_PAGE;
    this.limit = PAGINATION.DEFAULT_LIMIT;
  }

  filter() {
    const conditions = {};

    for (const [key, value] of Object.entries(this.params)) {
      if (value === undefined || value === "") continue;

      // Range filters arrive as `minPrice` / `maxPrice` style keys.
      const rangeMatch = /^(min|max)([A-Z]\w*)$/.exec(key);
      if (rangeMatch) {
        const [, bound, rawField] = rangeMatch;
        const field = rawField[0].toLowerCase() + rawField.slice(1);
        if (!this.allowedFilters.has(field)) continue;

        conditions[field] = {
          ...conditions[field],
          [bound === "min" ? "$gte" : "$lte"]: value,
        };
        continue;
      }

      if (!this.allowedFilters.has(key)) continue;

      // `?category=a,b` becomes an $in rather than a literal match.
      conditions[key] = Array.isArray(value)
        ? { $in: value }
        : typeof value === "string" && value.includes(",")
          ? { $in: value.split(",").map((part) => part.trim()).filter(Boolean) }
          : value;
    }

    if (Object.keys(conditions).length > 0) this.query = this.query.find(conditions);

    return this;
  }

  /**
   * Full-text search over the model's text index.
   */
  search() {
    const term = this.params.search?.trim();
    if (term) {
      this.query = this.query.find({ $text: { $search: term } });
    }
    return this;
  }

  sort() {
    const requested = this.params.sort;

    const spec = (requested ?? this.defaultSort)
      .split(",")
      .map((field) => field.trim())
      .filter((field) => {
        const bare = field.startsWith("-") ? field.slice(1) : field;
        // The default sort is trusted; client-supplied fields must be allowed.
        return requested ? this.allowedSortFields.has(bare) : true;
      })
      .join(" ");

    this.query = this.query.sort(spec || this.defaultSort.replace(/,/g, " "));

    return this;
  }

  paginate() {
    this.page = Math.max(Number(this.params.page) || PAGINATION.DEFAULT_PAGE, 1);
    this.limit = Math.min(
      Math.max(Number(this.params.limit) || PAGINATION.DEFAULT_LIMIT, 1),
      PAGINATION.MAX_LIMIT
    );

    this.query = this.query.skip((this.page - 1) * this.limit).limit(this.limit);

    return this;
  }

  /**
   * Projection allow-list. Clients may narrow the payload but never widen it
   * into fields the model marks `select: false`.
   */
  selectFields(allowedFields = []) {
    const requested = this.params.fields;
    if (!requested || allowedFields.length === 0) return this;

    const projection = requested
      .split(",")
      .map((field) => field.trim())
      .filter((field) => allowedFields.includes(field))
      .join(" ");

    if (projection) this.query = this.query.select(projection);

    return this;
  }

  apply() {
    return this.filter().search().sort().paginate();
  }

  /**
   * Runs the query and its matching count in parallel.
   */
  async execute() {
    const countQuery = this.query.model.find().merge(this.query.getFilter());

    const [items, total] = await Promise.all([
      this.query.lean().exec(),
      countQuery.countDocuments().exec(),
    ]);

    return { items, total, page: this.page, limit: this.limit };
  }
}

module.exports = QueryFeatures;
