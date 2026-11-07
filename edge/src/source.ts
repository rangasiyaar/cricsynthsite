// Published files for the Worker: from the R2 bucket when it's bound (the publish job uploads there), else from the
// website's /data (the same files, public). Parsed files are kept in the isolate for a few minutes so a burst of
// requests parses each file once (parsing is what costs CPU time; waiting on the fetch doesn't).
import { NotFound, type Source } from "./analytics.ts";

const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 400;
// The match list and match files change when XIs are named or a toss is in: re-read them every minute. The analytics
// kit changes once a night, so it keeps the longer cache.
const FRESH = /^(index\.json|matches\/)/;
const ttl = (path: string) => (FRESH.test(path) ? 60_000 : TTL_MS);

export class EdgeSource implements Source {
  bucket: R2Bucket | undefined;
  base: string;
  private cache = new Map<string, { t: number; v: Promise<any> }>();

  constructor(bucket: R2Bucket | undefined, base: string) {
    this.bucket = bucket;
    this.base = base.replace(/\/$/, "");
  }

  get(path: string): Promise<any> {
    const now = Date.now();
    const hit = this.cache.get(path);
    if (hit && now - hit.t < ttl(path)) return hit.v;
    const v = this.load(path);
    v.catch(() => this.cache.delete(path));
    if (this.cache.size >= MAX_ENTRIES) {
      for (const k of [...this.cache.keys()].slice(0, MAX_ENTRIES / 4)) this.cache.delete(k);
    }
    this.cache.set(path, { t: now, v });
    return v;
  }

  private async load(path: string): Promise<any> {
    if (this.bucket) {
      const obj = await this.bucket.get(path);
      if (!obj) throw new NotFound(`404 loading ${path}`);
      return obj.json();
    }
    const r = await fetch(`${this.base}/${path}`, { cf: { cacheTtl: FRESH.test(path) ? 60 : 300, cacheEverything: true } } as RequestInit);
    if (r.status === 404) throw new NotFound(`404 loading ${path}`);
    if (!r.ok) throw new Error(`${r.status} loading ${path}`);
    return r.json();
  }
}

/** The Worker's own static files (wrangler.toml [assets], served only through the Worker): prepared answers. */
export class AssetSource implements Source {
  assets: Fetcher;
  private cache = new Map<string, { t: number; v: Promise<any> }>();
  constructor(assets: Fetcher) { this.assets = assets; }
  get(path: string): Promise<any> {
    const now = Date.now();
    const hit = this.cache.get(path);
    if (hit && now - hit.t < TTL_MS) return hit.v;
    const v = this.assets.fetch(new Request(`https://assets.local/${path}`)).then(async (r) => {
      if (r.status === 404) throw new NotFound(`404 loading ${path}`);
      if (!r.ok) throw new Error(`${r.status} loading ${path}`);
      return r.json();
    });
    v.catch(() => this.cache.delete(path));
    if (this.cache.size >= 60) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(path, { t: now, v });
    return v;
  }
}
