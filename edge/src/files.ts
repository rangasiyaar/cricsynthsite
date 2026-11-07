// A Source over local files (tests, and `node` runs against a downloaded kit).
import { readFile } from "node:fs/promises";
import { NotFound, type Source } from "./analytics.ts";

export class FileSource implements Source {
  base: string;
  constructor(base: string) { this.base = base.replace(/\/$/, ""); }
  async get(path: string): Promise<any> {
    try {
      return JSON.parse(await readFile(`${this.base}/${decodeURIComponent(path)}`, "utf8"));
    } catch (e: any) {
      if (e?.code === "ENOENT") throw new NotFound(`404 loading ${path}`);
      throw e;
    }
  }
}
