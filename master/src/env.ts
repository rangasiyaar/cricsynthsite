// The admin console's Worker (master.cricsynthesis.in): bindings, secrets and settings.
export interface Env {
  ASSETS: Fetcher;                    // the console's static pages (master/public, built from master/ui)
  GOOGLE_SA?: string;                 // secret: the service-account JSON key the API Worker uses (Firestore, Firebase Auth)
  ADMIN_EMAILS?: string;              // secret: comma-separated Google sign-in emails allowed in
  SESSION_SECRET?: string;            // optional secret: signs the session cookie (else derived from GOOGLE_SA)
  CF_API_TOKEN?: string;              // secret: Cloudflare token (analytics read)
  CF_ACCOUNT_ID?: string;             // secret: Cloudflare account id
  GH_TOKEN?: string;                  // optional secret: GitHub token with read access to Actions (pipeline health, downloads)
  FIRESTORE_PROJECT?: string;
  SITE_URL?: string;                  // the public site (its /data files)
  SITE_HOST?: string;                 // the zone / Web Analytics host
  GH_REPO?: string;
  GH_BRANCH?: string;
  API_SCRIPT?: string;                // the API Worker's script name (request counts)
}

export const site = (env: Env) => (env.SITE_URL || "https://cricsynthesis.in").replace(/\/+$/, "");
export const project = (env: Env) =>
  env.FIRESTORE_PROJECT || (env.GOOGLE_SA ? JSON.parse(env.GOOGLE_SA).project_id : "") || "cricsynthesis";
