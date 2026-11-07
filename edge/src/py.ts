// Python-compatible number output, so the Worker's answers and cards match the Python originals digit for digit:
// round(x, nd) and f"{x:.nf}" round the exact binary value with ties to even (JavaScript's toFixed rounds ties up),
// and a float that happens to be whole prints as "12.0" in Python (String() gives "12").

/** f"{x:.{nd}f}" */
export function fixed(x: number, nd: number): string {
  if (!Number.isFinite(x)) return x > 0 ? "inf" : x < 0 ? "-inf" : "nan";
  const neg = x < 0 || Object.is(x, -0);
  const exact = Math.abs(x).toFixed(Math.min(100, nd + 30));     // exact decimal digits of the binary value
  const [whole, frac = ""] = exact.split(".");
  const keep = frac.slice(0, nd), rest = frac.slice(nd);
  let digits = whole + keep;
  const up = rest[0] > "5" || (rest[0] === "5" && /[1-9]/.test(rest.slice(1))) ||
    (rest[0] === "5" && !/[1-9]/.test(rest.slice(1)) && Number(digits[digits.length - 1]) % 2 === 1);
  if (up) {
    const arr = digits.split("").map(Number);
    let i = arr.length - 1;
    while (i >= 0) {
      if (arr[i] === 9) { arr[i] = 0; i--; } else { arr[i]++; break; }
    }
    if (i < 0) arr.unshift(1);
    digits = arr.join("");
  }
  const w = digits.slice(0, digits.length - nd) || "0", f = digits.slice(digits.length - nd);
  return (neg ? "-" : "") + w + (nd ? "." + f : "");
}

/** round(x, nd), as a number */
export function round(x: number, nd = 0): number {
  return Number(fixed(x, nd));
}

/** str(x) of a Python float (whole values keep ".0") */
export function pf(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** _r() in the Python ports: None for missing / non-finite values */
export function r(x: number | null | undefined, nd = 2): number | null {
  return x == null || !Number.isFinite(x) ? null : round(x, nd);
}

/** f"{n:,}" */
export function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** xml.sax.saxutils.escape */
export function escape(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const sum = (xs: number[]): number => { let s = 0; for (const x of xs) s += x; return s; };
export const mean = (xs: number[]): number => sum(xs) / xs.length;

/** max(xs, key=k): the first of the largest */
export function maxBy<T>(xs: T[], k: (x: T) => number): T {
  let best = xs[0], bk = k(xs[0]);
  for (const x of xs.slice(1)) { const v = k(x); if (v > bk) { best = x; bk = v; } }
  return best;
}

export function minBy<T>(xs: T[], k: (x: T) => number): T {
  let best = xs[0], bk = k(xs[0]);
  for (const x of xs.slice(1)) { const v = k(x); if (v < bk) { best = x; bk = v; } }
  return best;
}
