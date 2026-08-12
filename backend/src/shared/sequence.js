"use strict";

const mongoose = require("mongoose");

/**
 * Auto-incrementing integer ids.
 *
 * MongoDB has no native sequence, so one counter document per named sequence
 * holds the high-water mark. `findOneAndUpdate` with `$inc` is atomic at the
 * document level, which is what makes this safe: two concurrent signups can
 * never receive the same number, because the increment and the read happen in
 * a single server-side operation. Reading the counter and then writing it
 * back from application code would not survive that race.
 *
 * The trade-off worth naming: sequential ids are guessable and leak volume
 * (user 41 tells you roughly how many accounts exist). Anything exposed by id
 * therefore has to be authorised on ownership, not on obscurity - see
 * `authorizeSelfOrAbove`.
 */

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.model("Counter", counterSchema);

// Starting above zero keeps ids a consistent width early on and makes it
// obvious in logs that an id is ours rather than an array index.
const SEQUENCE_START = 1000;

/**
 * Returns the next integer in the named sequence.
 *
 * @param {string} name e.g. "user"
 * @param {import("mongoose").ClientSession} [session] Join a transaction.
 */
async function nextSequence(name, session) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
      session,
    }
  );

  // The counter's first increment yields 1, so subtract one to make
  // SEQUENCE_START itself the first id handed out.
  return SEQUENCE_START + counter.seq - 1;
}

module.exports = { nextSequence, Counter, SEQUENCE_START };
