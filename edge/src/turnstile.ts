// Cloudflare Turnstile (free bot check) for the public forms: contact, API access, job applications. Off until the
// Worker has TURNSTILE_SECRET (copied from the GitHub secret by deploy-worker.yml); then a form without a valid token
// is refused.
export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function human(secret: string | undefined, token: unknown, ip: string | null,
                            fetcher: typeof fetch = (i, init) => fetch(i, init)): Promise<boolean> {
  if (!secret) return true;
  const t = String(token ?? "");
  if (!t || t.length > 2048) return false;
  const body = new FormData();
  body.set("secret", secret); body.set("response", t);
  if (ip) body.set("remoteip", ip);
  try {
    const r = await fetcher(SITEVERIFY, { method: "POST", body });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch { return false; }
}

export const tokenOf = (body: any): unknown => body?.["cf-turnstile-response"] ?? body?.turnstile;
export const NOT_HUMAN = "Please complete the security check above the button, then send again.";
