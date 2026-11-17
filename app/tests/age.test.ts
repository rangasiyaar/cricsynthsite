// The 18+ check: whole years, birthdays, and impossible dates.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ageOn, MIN_AGE, validDob } from "../lib/ageRules.ts";

test("age counts whole years and turns over on the birthday", () => {
  const on = new Date(2026, 10, 17);                       // 17 Nov 2026
  assert.equal(MIN_AGE, 18);
  assert.equal(ageOn({ y: 2008, m: 11, d: 17 }, on), 18);  // 18 today
  assert.equal(ageOn({ y: 2008, m: 11, d: 18 }, on), 17);  // 18 tomorrow
  assert.equal(ageOn({ y: 2008, m: 12, d: 1 }, on), 17);
  assert.equal(ageOn({ y: 1990, m: 1, d: 1 }, on), 36);
  assert.equal(ageOn({ y: 2008, m: 2, d: 29 }, new Date(2026, 1, 28)), 17);   // leap-day birthdays
  assert.equal(ageOn({ y: 2008, m: 2, d: 29 }, new Date(2026, 2, 1)), 18);
});

test("only real past dates are accepted", () => {
  const on = new Date(2026, 10, 17);
  assert.equal(validDob({ y: 2000, m: 2, d: 30 }, on), false);
  assert.equal(validDob({ y: 2027, m: 1, d: 1 }, on), false);
  assert.equal(validDob({ y: 1880, m: 1, d: 1 }, on), false);
  assert.equal(validDob({ y: 2000, m: 2, d: 29 }, on), true);
  assert.equal(validDob({ y: 1999, m: 12, d: 31 }, on), true);
});
