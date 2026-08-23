"use strict";

const { z } = require("zod");

const overview = {
  query: z
    .object({
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
    })
    .strict()
    .refine(
      (value) =>
        !value.startDate ||
        !value.endDate ||
        value.startDate.getTime() <= value.endDate.getTime(),
      {
        path: ["endDate"],
        message: "End date must be after start date",
      }
    ),
};

module.exports = { overview };
