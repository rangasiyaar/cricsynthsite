// The 18+ rule itself, with no browser or Firebase code (unit-tested in tests/age.test.ts).
export const MIN_AGE = 18;

/** Whole years between a date of birth and `on`. */
export function ageOn(dob: { y: number; m: number; d: number }, on = new Date()): number {
  let a = on.getFullYear() - dob.y;
  if (on.getMonth() + 1 < dob.m || (on.getMonth() + 1 === dob.m && on.getDate() < dob.d)) a -= 1;
  return a;
}

/** A real calendar date in the past (rejects 31 Feb, the future, and impossible years). */
export function validDob(dob: { y: number; m: number; d: number }, on = new Date()): boolean {
  const t = new Date(dob.y, dob.m - 1, dob.d);
  return t.getFullYear() === dob.y && t.getMonth() === dob.m - 1 && t.getDate() === dob.d && t <= on && dob.y >= on.getFullYear() - 120;
}

