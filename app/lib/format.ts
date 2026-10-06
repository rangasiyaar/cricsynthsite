export const pct = (p: number | null | undefined, digits = 0) =>
  p === null || p === undefined || Number.isNaN(p) ? "—" : `${(100 * p).toFixed(digits)}%`;

export const num = (x: number | null | undefined, digits = 0) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : x.toFixed(digits);

export const range = (q: Record<string, number> | undefined, lo = "10", hi = "90") =>
  q && q[lo] !== undefined ? `${Math.round(q[lo])}–${Math.round(q[hi])}` : "—";

export const KIND: Record<string, string> = {
  pace_right: "Right-arm pace", pace_left: "Left-arm pace", off_spin: "Off-spin", leg_spin: "Leg-spin",
  left_arm_orthodox: "Left-arm orthodox", left_arm_wrist: "Left-arm wrist-spin", slow: "Slow", unknown: "—",
};

export const FORMAT: Record<string, string> = { T20: "T20", T10: "T10", HUNDRED: "The Hundred", OD: "One-day (50 overs)" };

export function signed(d: number, digits = 0, unit = "") {
  const v = Number(d.toFixed(digits));
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;
}
