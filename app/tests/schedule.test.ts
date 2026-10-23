// node --test: the app's match list status and countdown (fixture times are IST).
import { test } from "node:test";
import assert from "node:assert/strict";
import { countdown, kickoffMs, startLabel, status } from "../lib/schedule.ts";

const ist = (s: string) => Date.parse(`${s}+05:30`);

test("kickoff is read in IST, and a missing time means the end of the day", () => {
  assert.equal(kickoffMs("2026-10-23", "14:00"), ist("2026-10-23T14:00:00"));
  assert.equal(kickoffMs("2026-10-23", null), ist("2026-10-23T23:59:00"));
  assert.equal(kickoffMs(undefined, "14:00"), null);
});

test("upcoming before the start, live while the match can still be on, then finished", () => {
  const m = { date: "2026-10-23", start_time: "14:00", format: "OD" };
  assert.equal(status(m, ist("2026-10-23T13:59:00")), "upcoming");
  assert.equal(status(m, ist("2026-10-23T14:00:00")), "live");
  assert.equal(status(m, ist("2026-10-23T22:30:00")), "live");
  assert.equal(status(m, ist("2026-10-23T23:30:00")), "finished");
  assert.equal(status({ ...m, format: "T20" }, ist("2026-10-23T18:30:00")), "finished");
  assert.equal(status({ date: undefined, start_time: undefined, format: "T20" }, Date.now()), "upcoming");
});

test("countdown shows days and hours far out, then hh:mm:ss", () => {
  const k = ist("2026-10-23T14:00:00");
  assert.equal(countdown(k, k - (2 * 86400 + 4 * 3600) * 1000), "2d 04h");
  assert.equal(countdown(k, k - (2 * 3600 + 14 * 60 + 37) * 1000), "02:14:37");
  assert.equal(countdown(k, k), null);
  assert.equal(countdown(null, k), null);
});

test("start label is the IST day and time", () => {
  assert.equal(startLabel("2026-10-23", "14:00"), "23 Oct · 2:00 PM");
  assert.equal(startLabel("2026-10-23"), "23 Oct");
});
