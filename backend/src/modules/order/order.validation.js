"use strict";

const { z } = require("zod");
const { objectId, integerId } = require("../../shared/validators");
const {
  ORDER,
  ORDER_STATUS_VALUES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  PAGINATION,
} = require("../../shared/constants");

/**
 * The order contract.
 *
 * **Read this before adding a field.** Note what is absent from
 * `placeOrder`: `unitPrice`, `subtotal`, `total`, `discount`, `shippingFee`,
 * `status`, `paymentStatus`, `orderNumber`, `userId`. Not one of them may
 * come from a client, and because every object here is `.strict()`, sending
 * one is a **422 rather than a silently ignored key**.
 *
 * That distinction is the whole defence. A schema that dropped unknown fields
 * would leave `{"items":[...],"total":1}` looking like it worked, and the
 * only thing standing between that and a free order would be every future
 * developer remembering never to read `req.body.total`. Rejecting loudly
 * means the mistake cannot be made silently, and an attacker probing for it
 * gets a validation error instead of a signal.
 *
 * Prices are resolved from the catalog inside the service. The client
 * chooses *what* and *how many*; the server decides what it costs.
 */

const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, "Enter a valid phone number");

const personName = z
  .string()
  .trim()
  .min(1, "Required")
  .max(120, "Must be at most 120 characters")
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u, "Enter a valid name");

const email = z.email("Enter a valid email address").max(160).trim().toLowerCase();

const note = z.string().trim().max(ORDER.MAX_NOTE_LENGTH).optional();

/**
 * Where it goes. `line1` and `city` are the minimum a courier can act on;
 * everything else is optional because addresses outside a dense city often
 * genuinely have no postcode or district, and demanding one just teaches
 * people to type "n/a".
 */
const shippingAddress = z
  .object({
    line1: z.string().trim().min(1, "Address is required").max(240),
    line2: z.string().trim().max(240).optional(),
    area: z.string().trim().max(120).optional(),
    city: z.string().trim().min(1, "City is required").max(120),
    district: z.string().trim().max(120).optional(),
    postalCode: z.string().trim().max(24).optional(),
    country: z.string().trim().max(80).default("Bangladesh"),
  })
  .strict();

/**
 * What is being bought. Identical in shape to a cart add, deliberately: the
 * checkout page hands over what it already has, and the two paths agree on
 * how a variable product is addressed.
 */
const orderItem = z
  .object({
    productId: objectId,
    variantId: objectId.nullish(),
    quantity: z
      .number()
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(ORDER.MAX_QUANTITY_PER_ITEM),
  })
  .strict();

const placeOrder = {
  body: z
    .object({
      items: z
        .array(orderItem)
        .min(1, "An order needs at least one item")
        .max(ORDER.MAX_ITEMS, `An order may contain at most ${ORDER.MAX_ITEMS} items`),

      contact: z.object({ name: personName, phone }).strict(),

      shippingAddress,

      note,

      /**
       * Present so the field is explicit in the contract and the frontend can
       * render a choice, even though there is exactly one option today. A
       * second method arriving should not require a client change to a
       * request that never named the first.
       */
      paymentMethod: z
        .enum(PAYMENT_METHOD_VALUES)
        .default(PAYMENT_METHOD.CASH_ON_DELIVERY),

      /**
       * Guest checkout only. Offers to turn this purchase into an account:
       * the order is placed either way, and a verification email follows.
       *
       * Ignored for a signed-in caller, who already has one - see the refine
       * below for why `email` is conditionally required.
       */
      createAccount: z.boolean().default(false),

      /**
       * Where the receipt goes. Optional in general because a signed-in
       * customer's address is already known, and required when a guest asks
       * for an account, since there would otherwise be nothing to verify.
       */
      email: email.optional(),

      /**
       * Optional double-submit guard. Send the same key with a retried
       * request and the original order comes back instead of a second one.
       *
       * Costs a client nothing if unused, which is why it is here: a
       * double-tapped "Place order" on a flaky mobile connection is the
       * normal way duplicate cash-on-delivery orders get created, and the
       * customer only finds out when two couriers arrive.
       *
       * The key is namespaced server-side to whoever is ordering, so a retry
       * has to come from the same caller with the same identifying fields -
       * see `scopedIdempotencyKey` in the service for why that scoping is a
       * security requirement rather than a convenience.
       */
      idempotencyKey: z.string().trim().min(8).max(120).optional(),
    })
    .strict()
    .superRefine((body, ctx) => {
      if (body.createAccount && !body.email) {
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: "Email is required to create an account",
        });
      }
    }),
};

/* ------------------------------- Listings -------------------------------- */

const pagination = z
  .object({
    page: z.coerce.number().int().min(0).default(PAGINATION.DEFAULT_PAGE),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION.MAX_LIMIT)
      .default(PAGINATION.DEFAULT_LIMIT),
  })
  .strict()
  // `.prefault`, not `.default`: a Zod object default returns the literal
  // value given, without applying the inner field defaults, which would leave
  // `page` undefined and `skip` NaN.
  .prefault({});

const sort = z
  .object({
    field: z.enum(["placedAt", "total", "status"]).default("placedAt"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .prefault({});

const dateRange = {
  placedFrom: z.coerce.date().optional(),
  placedTo: z.coerce.date().optional(),
};

const rangeIsSane = (body, ctx) => {
  if (body.placedFrom && body.placedTo && body.placedFrom > body.placedTo) {
    ctx.addIssue({
      code: "custom",
      path: ["placedFrom"],
      message: "placedFrom must be before placedTo",
    });
  }
};

/**
 * A customer's own orders.
 *
 * There is no `userId` field, and that is not an oversight: the owner is
 * taken from the verified token. Accepting one here would invite the belief
 * that it does something, and the day someone wires it up is the day the
 * endpoint serves other people's orders.
 */
const myOrders = {
  body: z
    .object({
      status: z
        .union([z.enum(ORDER_STATUS_VALUES), z.array(z.enum(ORDER_STATUS_VALUES)).min(1)])
        .optional(),
      ...dateRange,
      sort,
      pagination,
    })
    .strict()
    .superRefine(rangeIsSane),
};

/**
 * The staff queue. Everything the customer list has, plus the fields only
 * staff may filter on.
 */
const filterOrders = {
  body: z
    .object({
      status: z
        .union([z.enum(ORDER_STATUS_VALUES), z.array(z.enum(ORDER_STATUS_VALUES)).min(1)])
        .optional(),
      paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),

      /**
       * Matches an order number, customer name, phone or email. One box,
       * because that is what the person on the phone has - a number the
       * customer read out, or a name.
       */
      search: z.string().trim().min(1).max(160).optional(),

      userId: integerId.optional(),
      // Narrow to guest checkouts, which are the ones without an account
      // behind them and the ones fraud review looks at first.
      guestOnly: z.boolean().optional(),

      minTotal: z.coerce.number().min(0).optional(),
      maxTotal: z.coerce.number().min(0).optional(),

      ...dateRange,

      // Soft-deleted orders are hidden unless explicitly asked for.
      includeDeleted: z.boolean().default(false),

      sort,
      pagination,
    })
    .strict()
    .superRefine((body, ctx) => {
      rangeIsSane(body, ctx);

      if (body.minTotal != null && body.maxTotal != null && body.minTotal > body.maxTotal) {
        ctx.addIssue({
          code: "custom",
          path: ["minTotal"],
          message: "minTotal must not exceed maxTotal",
        });
      }
    }),
};

/* ---------------------------- Staff mutations ---------------------------- */

/**
 * Status change.
 *
 * The note is required for outcomes that went wrong. Enforced with a refine
 * rather than in the service so the requirement is visible in the schema, the
 * docs and the error - all three generated from this one declaration.
 */
const changeStatus = {
  params: z.object({ id: integerId }).strict(),
  body: z
    .object({
      status: z.enum(ORDER_STATUS_VALUES),
      note: z.string().trim().max(ORDER.MAX_NOTE_LENGTH).optional(),
    })
    .strict(),
};

/**
 * Correcting the delivery details after the fact - a mistyped house number,
 * a phone that turned out to be wrong.
 *
 * Nothing about money or state is reachable from here. Editing an address is
 * a routine fix a moderator makes daily; editing a total is not something
 * this API does at all.
 */
const updateOrderDetails = {
  params: z.object({ id: integerId }).strict(),
  body: z
    .object({
      contact: z
        .object({ name: personName.optional(), phone: phone.optional() })
        .strict()
        .optional(),
      shippingAddress: shippingAddress.partial().strict().optional(),
      note: z.string().trim().max(ORDER.MAX_NOTE_LENGTH).nullish(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "Send at least one field to update",
    }),
};

const orderById = { params: z.object({ id: integerId }).strict() };

module.exports = {
  placeOrder,
  myOrders,
  filterOrders,
  changeStatus,
  updateOrderDetails,
  orderById,
};
