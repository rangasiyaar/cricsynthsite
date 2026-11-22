// Account emails sent by the API Worker (CricSynthesis Pro, API keys and limits) and the admin console (upgrade
// decisions, subscriptions given by our team, account deletion). The same branded layout as the sign-ups Apps Script's
// emails (welcome, API requests, job applications), so every email looks alike. Each template returns
// { subject, html, text }; sending is send() through Resend (RESEND_API_KEY).
// Names and key names come from users: everything they typed is escaped before it goes into HTML.

export type Email = { subject: string; html: string; text: string };

export const SITE = "https://cricsynthesis.in";
export const FROM = "CricSynthesis <hello@cricsynthesis.in>";
export const REPLY_TO = "hello@cricsynthesis.in";
const ADDRESS = "13, BTM Stage 1, Bengaluru, 560068";
const FLINK = "color:#94bce3;text-decoration:none;";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);
const firstName = (name?: string | null) => String(name || "").trim().split(/\s+/)[0] || "there";
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const dayTime = (d: Date) => `${day(d)}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST`;
const p = (html: string) => `<p style="margin:0 0 16px 0;color:#3d4146;font-size:16px;line-height:1.65;">${html}</p>`;
const b = (s: string) => `<strong style="color:#1d1f20">${s}</strong>`;
const mailto = (a: string) => `<a href="mailto:${a}" style="${FLINK}">${a}</a>`;

/** A two-column summary box (label, value), e.g. the plan, the first charge and how to cancel. */
function facts(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 22px 0;background:#f5f7f9;border:1px solid #e1e6eb;border-radius:8px;">` +
    rows.map(([k, v], i) => `<tr><td style="padding:12px 16px;${i ? "border-top:1px solid #e1e6eb;" : ""}color:#6b7075;font-size:14px;width:42%;">${k}</td>` +
      `<td style="padding:12px 16px;${i ? "border-top:1px solid #e1e6eb;" : ""}color:#1d1f20;font-size:15px;font-weight:600;">${v}</td></tr>`).join("") + "</table>";
}

/** A list of links with a line each (as the Apps Script's links()). */
function links(title: string, rows: [string, string, string][]) {
  return `<p style="margin:8px 0 6px 0;color:#1d1f20;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${title}</p>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;">` +
    rows.map(([label, url, line]) => `<tr><td style="padding:10px 0;border-top:1px solid #e4e5e7;">` +
      `<a href="${url}" style="color:#416180;font-size:15px;font-weight:700;text-decoration:none;">${label} &rarr;</a>` +
      `<div style="color:#6b7075;font-size:14px;line-height:1.5;margin-top:2px;">${line}</div></td></tr>`).join("") + "</table>";
}

/** A quoted note from our team (approve / decline), escaped. */
const note = (text?: string | null) => text?.trim()
  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;"><tr>` +
    `<td style="border-left:3px solid #5980a6;padding:4px 0 4px 14px;color:#3d4146;font-size:15px;line-height:1.6;">` +
    `<span style="display:block;color:#6b7075;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Note from our team</span>` +
    `${esc(text.trim()).replace(/\n/g, "<br>")}</td></tr></table>` : "";

type Layout = { title: string; reason: string; links?: [string, string][]; cta: string; ctaUrl: string; eyebrow: string; heading: string;
                extraNotice?: [string, string] };

const ACCOUNT_LINKS: [string, string][] = [["Matches", `${SITE}/matches/`], ["CricSynthesis Pro", `${SITE}/pro/`], ["Your account", `${SITE}/account/`],
  ["Privacy policy", `${SITE}/privacy/`], ["Terms", `${SITE}/terms/`]];
export const API_LINKS: [string, string][] = [["API reference", `${SITE}/docs/`], ["Playground", `${SITE}/playground/`], ["Your account", `${SITE}/account/`],
  ["Privacy policy", `${SITE}/privacy/`], ["Terms", `${SITE}/terms/`]];

/** The shared design: colour stripe, centred logo, heading and body, button, sign-off, dark footer with links, social
 *  icons, address and notices (the Apps Script's brandLayout + accountLayout). */
function layout(body: string, o: Layout): string {
  const font = "'Barlow', 'Segoe UI', Arial, sans-serif";
  const small = "margin:0 0 10px 0;color:#b6babe;font-size:12px;line-height:1.6;";
  const social = (url: string, icon: string, name: string) => `<td style="padding:0 5px;"><a href="${url}" style="text-decoration:none;">` +
    `<img src="${SITE}/email/${icon}.png" alt="${name}" width="32" height="32" style="display:block;border:0;outline:none;width:32px;height:32px;"></a></td>`;
  const notices: [string, string][] = [
    ...(o.extraNotice ? [o.extraNotice] : []),
    ["Questions?", `Reply to this email or write to ${mailto("hello@cricsynthesis.in")}; it reaches the team.`],
    ["Your data.", `We use your details only to handle your account and requests, as described in our <a href="${SITE}/privacy/" style="${FLINK}">privacy policy</a>. Manage email preferences in <a href="${SITE}/account/" style="${FLINK}">your account</a>, or write to ${mailto("privacy@cricsynthesis.in")} to have your data deleted.`],
    ["Forecasts are estimates.", "Our probabilities and projections come from simulation; results will often differ."],
  ];
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<meta name="color-scheme" content="light">` +
    `<style>@media only screen and (max-width:620px){.cs-outer{padding:12px 6px !important}.cs-px{padding-left:20px !important;padding-right:20px !important}` +
    `.cs-card{border-radius:8px !important}}</style><title>${o.title}</title></head>` +
    `<body style="margin:0;padding:0;background:#f2f2f3;font-family:${font};">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f2f3;"><tr><td class="cs-outer" align="center" style="padding:32px 12px;">` +
    `<table role="presentation" width="680" class="cs-card" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dcdde0;border-radius:12px;overflow:hidden;">` +
    `<tr><td style="padding:0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>` +
    `<td width="54%" style="height:6px;background:#5980a6;font-size:0;line-height:0;">&nbsp;</td>` +
    `<td style="height:6px;background:#b5653a;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>` +
    `<tr><td class="cs-px" align="center" style="padding:34px 36px 10px 36px;"><a href="${SITE}" style="text-decoration:none;">` +
    `<img src="${SITE}/email-logo.png" alt="CricSynthesis" width="175" height="34" style="display:block;margin:0 auto;border:0;outline:none;width:175px;height:auto;"></a></td></tr>` +
    `<tr><td class="cs-px" style="padding:0 36px;"><div style="height:1px;background:#e4e5e7;font-size:0;line-height:0;">&nbsp;</div></td></tr>` +
    `<tr><td class="cs-px" style="padding:28px 36px 0 36px;">` +
    `<p style="margin:0 0 10px 0;color:#416180;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">${o.eyebrow}</p>` +
    `<h1 style="margin:0 0 18px 0;color:#1d1f20;font-size:24px;line-height:1.3;font-weight:700;">${o.heading}</h1>${body}</td></tr>` +
    `<tr><td class="cs-px" style="padding:8px 36px 30px 36px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>` +
    `<td style="background:#5980a6;border-radius:6px;"><a href="${o.ctaUrl}" style="display:inline-block;padding:12px 22px;color:#ffffff;` +
    `font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;">${o.cta}</a></td></tr></table></td></tr>` +
    `<tr><td class="cs-px" style="padding:0 36px 28px 36px;color:#3d4146;font-size:15px;line-height:1.6;">Regards,<br><strong style="color:#1d1f20;">Team CricSynthesis</strong></td></tr>` +
    `<tr><td class="cs-px" style="background:#1d2d3d;padding:32px 36px 28px 36px;" align="center">` +
    `<a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/email/logo-light.png" alt="CricSynthesis" width="150" style="display:block;margin:0 auto 20px auto;border:0;outline:none;width:150px;height:auto;"></a>` +
    `<p style="margin:0 0 20px 0;color:#5d7a96;font-size:13px;">${(o.links || ACCOUNT_LINKS).map(([l, u]) => `<a href="${u}" style="${FLINK}">${l}</a>`).join(" &nbsp;·&nbsp; ")}</p>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 20px auto;"><tr>` +
    social("https://in.linkedin.com/company/cricsynthesis", "linkedin", "LinkedIn") + social("https://x.com/cricsynthesis", "x", "X") +
    social("https://instagram.com/cricsynthesis", "instagram", "Instagram") + `</tr></table>` +
    `<p style="margin:0;color:#b6babe;font-size:12px;line-height:1.6;">${ADDRESS}</p>` +
    `<p style="margin:4px 0 0 0;font-size:12px;line-height:1.6;"><a href="${SITE}" style="${FLINK}">cricsynthesis.in</a></p>` +
    `<div style="height:1px;background:#33475b;margin:24px 0 20px 0;font-size:0;line-height:0;">&nbsp;</div><div style="text-align:left;">` +
    notices.map(([k, v]) => `<p style="${small}"><strong style="color:#e6e7e8;">${k}</strong> ${v}</p>`).join("") + `</div>` +
    `<p style="margin:16px 0 0 0;color:#8f9499;font-size:11px;line-height:1.6;">© ${new Date().getFullYear()} CricSynthesis. You are receiving this because ${o.reason}.</p>` +
    `</td></tr></table></td></tr></table></body></html>`;
}

const sign = `\n\nQuestions? Reply to this email.\n\nTeam CricSynthesis\n\n© ${new Date().getFullYear()} CricSynthesis · ${ADDRESS} · ${SITE}`;
const PRO_REASON = "you have a CricSynthesis Pro subscription";

// ── CricSynthesis Pro (sent by the API Worker) ────────────────────────────────────────────────────────────────────

export function proStarted(d: { name?: string | null; billing: "monthly" | "yearly"; amount: number; trial: boolean; firstCharge: Date }): Email {
  const per = d.billing === "monthly" ? "month" : "year", plan = d.billing === "monthly" ? "Monthly" : "Yearly";
  const intro = d.trial
    ? `Every tab of every match we cover, plus MatchSynth Lab, is open for you now.`
    : `Thank you for subscribing. Every tab of every match we cover, plus MatchSynth Lab, is open now.`;
  const rows: [string, string][] = d.trial
    ? [["Plan", `CricSynthesis Pro, ${plan}`], ["Free until", dayTime(d.firstCharge)], ["First charge", `${rupees(d.amount)} on ${day(d.firstCharge)}, then every ${per}`],
       ["Cancel", "Any time, in one tap from your account"]]
    : [["Plan", `CricSynthesis Pro, ${plan}`], ["Paid today", rupees(d.amount)], ["Renews", `${day(d.firstCharge)}, ${rupees(d.amount)} a ${per}`],
       ["Cancel", "Any time, in one tap from your account"]];
  const after = d.trial
    ? `Not for you? Cancel before ${dayTime(d.firstCharge)} and you won't be charged. The ₹5 autopay check is refunded automatically.`
    : `You'll get a receipt by email for every payment. Cancelling stops the next renewal; you keep Pro until the end of the ${per} you've paid for.`;
  return {
    subject: d.trial ? "Your CricSynthesis Pro free day has started" : "Welcome to CricSynthesis Pro",
    html: layout(p(intro) + facts(rows) + p(after) + links("Make the most of it", [
      ["Match centre", `${SITE}/matches/`, "Projections, players, venue and fantasy for every match we cover"],
      ["MatchSynth Lab", `${SITE}/lab/`, "Change the XI, toss or conditions and replay the match"],
      ["Your plan", `${SITE}/account/#subscription`, "See your plan, or cancel"],
    ]), { eyebrow: "CricSynthesis Pro", heading: d.trial ? "Your free day has started." : "You're in. Welcome to Pro.",
          title: "CricSynthesis Pro", reason: "you started a CricSynthesis Pro subscription", cta: "Open the match centre", ctaUrl: `${SITE}/matches/` }),
    text: `${d.trial ? "Your free day has started." : "You're in. Welcome to Pro."}\n\n${intro}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${after}\n\n` +
      `Match centre: ${SITE}/matches/\nMatchSynth Lab: ${SITE}/lab/\nYour plan: ${SITE}/account/#subscription${sign}`,
  };
}

export function paymentFailed(d: { name?: string | null; billing: "monthly" | "yearly"; amount: number; graceUntil: Date }): Email {
  const intro = `We couldn't take your ${d.billing} CricSynthesis Pro payment of ${rupees(d.amount)}. This usually happens when a UPI Autopay ` +
    `mandate was paused, a card expired or there wasn't enough balance.`;
  const what = `We'll try the payment again automatically. You keep Pro until ${day(d.graceUntil)}; if the payment still hasn't gone through by ` +
    `then, Pro switches off until you subscribe again.`;
  return {
    subject: "Action needed: your CricSynthesis Pro payment didn't go through",
    html: layout(p(`Hi ${esc(firstName(d.name))},`) + p(intro) + p(what) +
      p(`To fix it, check your UPI app or card, or open your account and subscribe again with another payment method.`),
      { eyebrow: "Payment", heading: "Your payment didn't go through.", title: "CricSynthesis Pro payment", reason: PRO_REASON,
        cta: "Open your account", ctaUrl: `${SITE}/account/#subscription` }),
    text: `Hi ${firstName(d.name)},\n\n${intro}\n\n${what}\n\nTo fix it, check your UPI app or card, or subscribe again with another payment method: ${SITE}/account/#subscription${sign}`,
  };
}

export function proCancelled(d: { name?: string | null; until: Date; trial: boolean }): Email {
  const intro = d.trial
    ? `You've cancelled CricSynthesis Pro during your free day, so you won't be charged. Pro stays on until ${dayTime(d.until)}.`
    : `You've cancelled CricSynthesis Pro. You won't be charged again, and Pro stays on until ${day(d.until)}.`;
  return {
    subject: "Your CricSynthesis Pro cancellation is confirmed",
    html: layout(p(`Hi ${esc(firstName(d.name))},`) + p(intro) +
      p(`After that, every match's Overview stays free. If you change your mind, you can subscribe again any time from your account.`),
      { eyebrow: "CricSynthesis Pro", heading: "Your cancellation is confirmed.", title: "CricSynthesis Pro cancelled", reason: PRO_REASON,
        cta: "Manage your plan", ctaUrl: `${SITE}/account/#subscription` }),
    text: `Hi ${firstName(d.name)},\n\n${intro}\n\nAfter that, every match's Overview stays free. Subscribe again any time: ${SITE}/pro/${sign}`,
  };
}

export function proEnded(d: { name?: string | null }): Email {
  return {
    subject: "Your CricSynthesis Pro has ended",
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Your CricSynthesis Pro has ended. Every match's Overview is still free: win chances, projected scores and the players to watch.`) +
      p(`Whenever you want the full match centre and MatchSynth Lab back, it's ${rupees(349)} a month or ${rupees(3769)} a year, and you can cancel any time.`),
      { eyebrow: "CricSynthesis Pro", heading: "Your Pro has ended.", title: "CricSynthesis Pro ended", reason: PRO_REASON,
        cta: "Get Pro again", ctaUrl: `${SITE}/pro/` }),
    text: `Hi ${firstName(d.name)},\n\nYour CricSynthesis Pro has ended. Every match's Overview is still free.\n\nGet Pro again (${rupees(349)} a month or ${rupees(3769)} a year): ${SITE}/pro/${sign}`,
  };
}

// ── decisions and subscriptions from our team (sent by the admin console) ─────────────────────────────────────────

const API_PLAN = { "api-plus": "API Plus", business: "Business API" } as const;
type ApiTier = keyof typeof API_PLAN;

export function upgradeApproved(d: { name?: string | null; plan: ApiTier; keys: number; note?: string | null }): Email {
  const plan = API_PLAN[d.plan], limit = d.plan === "business" ? "50,000" : "20,000";
  const keys = d.keys ? `All ${d.keys} of your active API key${d.keys === 1 ? " has" : "s have"} moved to ${plan}`
    : `New keys you create are set up for ${plan} by our team`;
  return {
    subject: `Your CricSynthesis ${plan} request is approved`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) + p(`Good news: your request for ${b(plan)} is approved.`) + note(d.note) +
      facts([["Plan", plan], ["Daily limit", `${limit} requests per key`], ["Your keys", keys], ["Included", "CricSynthesis Pro on the website and app"]]) +
      p(`Changes reach the API within a minute. Your usage and keys are in your account.`),
      { eyebrow: "API plan", heading: `${plan} is on.`, title: `CricSynthesis ${plan}`, reason: "you requested a plan change from your CricSynthesis account",
        links: API_LINKS, cta: "Open your account", ctaUrl: `${SITE}/account/` }),
    text: `Hi ${firstName(d.name)},\n\nYour request for ${plan} is approved.${d.note?.trim() ? `\n\nNote from our team: ${d.note.trim()}` : ""}\n\n` +
      `Daily limit: ${limit} requests per key\nYour keys: ${keys}\nIncluded: CricSynthesis Pro on the website and app\n\nYour account: ${SITE}/account/${sign}`,
  };
}

export function upgradeDeclined(d: { name?: string | null; plan: ApiTier; note?: string | null }): Email {
  const plan = API_PLAN[d.plan];
  return {
    subject: `About your CricSynthesis ${plan} request`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) + p(`Thank you for your interest in ${b(plan)}. We're not able to approve this request right now.`) +
      note(d.note) + p(`Your current keys keep working as before. If anything changes, or you'd like to talk it through, just reply to this email.`),
      { eyebrow: "API plan", heading: "About your request.", title: `CricSynthesis ${plan}`, reason: "you requested a plan change from your CricSynthesis account",
        links: API_LINKS, cta: "Open your account", ctaUrl: `${SITE}/account/` }),
    text: `Hi ${firstName(d.name)},\n\nThank you for your interest in ${plan}. We're not able to approve this request right now.` +
      `${d.note?.trim() ? `\n\nNote from our team: ${d.note.trim()}` : ""}\n\nYour current keys keep working as before. Reply to this email to talk it through.${sign}`,
  };
}

const TIER = { pro: "CricSynthesis Pro", "api-plus": "API Plus", business: "Business API" } as const;
type PaidTier = keyof typeof TIER;
const tierGives = (t: PaidTier) => t === "pro" ? "every tab of every match we cover, plus MatchSynth Lab"
  : `${t === "business" ? "Business API" : "API Plus"} limits on your API keys, plus CricSynthesis Pro on the website and app`;

export function subscriptionGiven(d: { name?: string | null; tier: PaidTier; until: Date | null; note?: string | null }): Email {
  const tier = TIER[d.tier];
  return {
    subject: `You've got ${tier}`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) + p(`Our team has given your account ${b(tier)}: ${tierGives(d.tier)}.`) + note(d.note) +
      facts([["Plan", tier], ["Until", d.until ? day(d.until) : "No end date"], ["Cost", "Nothing: no payment details needed"]]) +
      p(d.until ? `We'll remind you a few days before it ends. After that your account goes back to CricSynthesis Free, and nothing is charged.`
                : `It stays on until we change it. Nothing is charged.`),
      { eyebrow: "From our team", heading: `${tier} is on for you.`, title: tier, reason: "our team gave your account a subscription",
        links: d.tier === "pro" ? undefined : API_LINKS, cta: d.tier === "pro" ? "Open the match centre" : "Open your account",
        ctaUrl: d.tier === "pro" ? `${SITE}/matches/` : `${SITE}/account/` }),
    text: `Hi ${firstName(d.name)},\n\nOur team has given your account ${tier}: ${tierGives(d.tier)}.${d.note?.trim() ? `\n\nNote from our team: ${d.note.trim()}` : ""}\n\n` +
      `Until: ${d.until ? day(d.until) : "No end date"}\nCost: nothing${sign}`,
  };
}

export function subscriptionEnding(d: { name?: string | null; tier: PaidTier; until: Date }): Email {
  const tier = TIER[d.tier];
  const keep = d.tier === "pro" ? `To keep it, subscribe from ${rupees(349)} a month; you can cancel any time.`
    : `To keep ${tier}, reply to this email or request it again from your account.`;
  return {
    subject: `Your ${tier} ends on ${day(d.until)}`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) + p(`The ${b(tier)} our team gave your account ends on ${b(day(d.until))}. After that your account goes back to CricSynthesis Free; nothing is charged.`) + p(keep),
      { eyebrow: "From our team", heading: `Your ${tier} ends soon.`, title: tier, reason: "our team gave your account a subscription",
        links: d.tier === "pro" ? undefined : API_LINKS, cta: d.tier === "pro" ? "Get CricSynthesis Pro" : "Open your account",
        ctaUrl: d.tier === "pro" ? `${SITE}/pro/` : `${SITE}/account/` }),
    text: `Hi ${firstName(d.name)},\n\nThe ${tier} our team gave your account ends on ${day(d.until)}. After that your account goes back to CricSynthesis Free; nothing is charged.\n\n${keep}\n\n${d.tier === "pro" ? `${SITE}/pro/` : `${SITE}/account/`}${sign}`,
  };
}

// ── API keys and usage (sent by the API Worker) ───────────────────────────────────────────────────────────────────

export function keyCreated(d: { name?: string | null; keyName: string; prefix: string; at: Date }): Email {
  return {
    subject: "A new API key was created on your CricSynthesis account",
    html: layout(p(`Hi ${esc(firstName(d.name))},`) + p(`A new API key was created on your account.`) +
      facts([["Key", esc(d.keyName)], ["Starts with", `<code>${esc(d.prefix)}…</code>`], ["Created", dayTime(d.at)]]) +
      p(`If this was you, there's nothing to do. If it wasn't, revoke the key in your account straight away and change your password.`),
      { eyebrow: "Security", heading: "New API key created.", title: "New API key", reason: "an API key was created on your CricSynthesis account",
        links: API_LINKS, cta: "Review your keys", ctaUrl: `${SITE}/account/#api-keys` }),
    text: `Hi ${firstName(d.name)},\n\nA new API key was created on your account.\n\nKey: ${d.keyName}\nStarts with: ${d.prefix}…\nCreated: ${dayTime(d.at)}\n\n` +
      `If this wasn't you, revoke it straight away: ${SITE}/account/#api-keys${sign}`,
  };
}

export function limitReached(d: { name?: string | null; limit: number; plan: "free" | "pro" | "business"; keys?: number }): Email {
  const nextPlan = d.plan === "free" ? `${b("API Plus")} gives your account 20,000 requests a day (${rupees(4999)} a month) and includes CricSynthesis Pro.`
    : d.plan === "pro" ? `${b("Business API")} gives higher limits, priced for your volume.` : `Reply to this email and we'll look at higher limits with you.`;
  const shared = d.keys === undefined ? ", shared by all your keys and the AI-assistant connector"
    : d.keys > 1 ? `, shared by your ${d.keys} keys and the AI-assistant connector` : "";
  return {
    subject: `Your account reached today's API limit`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Your account used all ${d.limit.toLocaleString("en-IN")} of today's API requests${shared}. Further requests are refused until the limit resets at 05:30 IST (midnight UTC).`) +
      p(`Need more? ${nextPlan}`),
      { eyebrow: "Usage alert", heading: "Daily limit reached.", title: "API usage alert", reason: "you have usage alerts on in your CricSynthesis account",
        links: API_LINKS, cta: d.plan === "business" ? "See your usage" : "See plans", ctaUrl: d.plan === "business" ? `${SITE}/account/` : `${SITE}/pricing/#api`,
        extraNotice: ["Usage alerts.", `You get at most one of these a day. Turn them off under Email preferences in <a href="${SITE}/account/" style="${FLINK}">your account</a>.`] }),
    text: `Hi ${firstName(d.name)},\n\nYour account used all ${d.limit} of today's API requests${shared}. It resets at 05:30 IST (midnight UTC).\n\n` +
      `Plans: ${SITE}/pricing/#api\n\nTurn usage alerts off in your account: ${SITE}/account/${sign}`,
  };
}

export function accountDeleted(d: { name?: string | null }): Email {
  return {
    subject: "Your CricSynthesis account has been deleted",
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`As you asked, we've deleted your CricSynthesis account and the data linked to it: your profile, API keys, usage history and requests. You've been signed out everywhere.`) +
      p(`Records of past payments are kept only as long as the law requires for financial transactions. If you subscribed to Pro, the subscription was cancelled first, so nothing more will be charged.`) +
      p(`Thank you for using CricSynthesis. You're welcome back any time with a new account.`),
      { eyebrow: "Account", heading: "Your account has been deleted.", title: "Account deleted", reason: "you asked us to delete your CricSynthesis account",
        cta: "Visit CricSynthesis", ctaUrl: SITE }),
    text: `Hi ${firstName(d.name)},\n\nAs you asked, we've deleted your CricSynthesis account and the data linked to it: your profile, API keys, usage history and requests.\n\n` +
      `Records of past payments are kept only as long as the law requires. Any Pro subscription was cancelled first, so nothing more will be charged.\n\nThank you for using CricSynthesis.${sign}`,
  };
}

/** Send through Resend; returns the email id, or throws with Resend's message. */
export async function send(key: string, to: string, mail: Email,
                           opts: { from?: string; replyTo?: string; attachments?: { filename: string; content: string }[] } = {},
                           fetcher: typeof fetch = (i, init) => fetch(i, init)): Promise<string> {
  const r = await fetcher("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: opts.from || FROM, to: [to], reply_to: opts.replyTo || REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text,
                           ...(opts.attachments?.length ? { attachments: opts.attachments } : {}) }),
  });
  const j = await r.json().catch(() => ({})) as { id?: string; message?: string };
  if (!r.ok || !j.id) throw new Error(`Resend ${r.status}: ${j.message || "no id"}`);
  return j.id;
}

/** The contact form's acknowledgement: what they sent, and when to expect a reply. */
export function contactReceived(d: { name?: string | null; topic: string; message: string; at: Date }): Email {
  const excerpt = d.message.trim().length > 600 ? `${d.message.trim().slice(0, 600)}…` : d.message.trim();
  return {
    subject: "Thanks for contacting CricSynthesis",
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Thanks for getting in touch. Your message has reached our team, and we'll get back to you soon, usually within one working day.`) +
      facts([["Topic", esc(d.topic)], ["Sent", dayTime(d.at)]]) +
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;"><tr>` +
      `<td style="border-left:3px solid #5980a6;padding:4px 0 4px 14px;color:#3d4146;font-size:15px;line-height:1.6;white-space:pre-line;">` +
      `<span style="display:block;color:#6b7075;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Your message</span>` +
      `${esc(excerpt)}</td></tr></table>` +
      p(`If you need to add anything, just reply to this email.`),
      { eyebrow: "Contact", heading: "We've got your message.", title: "Thanks for contacting us", reason: "you sent a message through the contact form on cricsynthesis.in",
        cta: "Visit CricSynthesis", ctaUrl: SITE }),
    text: `Hi ${firstName(d.name)},\n\nThanks for getting in touch. Your message has reached our team, and we'll get back to you soon, usually within one working day.\n\n` +
      `Topic: ${d.topic}\nSent: ${dayTime(d.at)}\n\nYour message:\n${excerpt}\n\nIf you need to add anything, just reply to this email.${sign}`,
  };
}

// ── emails that used to come from the sign-ups Apps Script: welcome, API access, upgrade requests, job applications ──

/** Welcome, sent once after a new account confirms it is 18 or over. */
export function welcomeEmail(d: { name?: string | null }): Email {
  return {
    subject: "Welcome to CricSynthesis",
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Welcome to CricSynthesis. Before every match we cover, you can see who's likely to win, the likely scores and the players to watch, and the Overview is free for every match.`) +
      links("Where to start", [
        ["Today's matches", `${SITE}/matches/`, "Open any match for its forecast"],
        ["MatchSynth Lab", `${SITE}/lab/`, "Change the toss, the conditions or a line-up and replay the match"],
        ["CricSynthesis Pro", `${SITE}/pro/`, "Every match-centre tab: scores, wickets, players, match-ups, the ground and fantasy picks"],
        ["The Android app", `${SITE}/app/`, "The same match centre in your pocket"],
      ]) +
      p(`You can choose which emails you get under Email preferences in your account.`),
      { eyebrow: "Welcome", heading: "You're in.", title: "Welcome to CricSynthesis", reason: "you created a CricSynthesis account",
        cta: "See today's matches", ctaUrl: `${SITE}/matches/` }),
    text: `Hi ${firstName(d.name)},\n\nWelcome to CricSynthesis. Before every match we cover, you can see who's likely to win, the likely scores and the players to watch, and the Overview is free for every match.\n\n` +
      `Today's matches: ${SITE}/matches/\nMatchSynth Lab: ${SITE}/lab/\nCricSynthesis Pro: ${SITE}/pro/\nThe Android app: ${SITE}/app/${sign}`,
  };
}

const INTEREST: Record<string, string> = { analytics: "Analytics: ratings, projections, match-ups", simulation: "Simulation: match forecasts and what-ifs",
  graphics: "Graphics: share-ready cards", all: "The full catalog" };
export const interestName = (k?: string | null) => INTEREST[String(k || "")] || "Not specified";

/** The API access form's acknowledgement. */
export function apiAccessReceived(d: { name?: string | null; interest?: string | null; organization?: string | null }): Email {
  return {
    subject: "We've got your API access request",
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Thanks for your interest in the CricSynthesis API. We'll be in touch with your key and next steps, usually within one working day.`) +
      facts([["Interested in", esc(interestName(d.interest))], ...(d.organization ? [["Organisation", esc(d.organization)] as [string, string]] : [])]) +
      p(`Want to start now? Sign in and create a free key from your account: it gives you ${b("200 requests a day")} on every endpoint.`),
      { eyebrow: "API access", heading: "Request received.", title: "API access request", reason: "you asked for API access on cricsynthesis.in",
        links: API_LINKS, cta: "Create a free key", ctaUrl: `${SITE}/account/#api-keys` }),
    text: `Hi ${firstName(d.name)},\n\nThanks for your interest in the CricSynthesis API. We'll be in touch with your key and next steps, usually within one working day.\n\n` +
      `Interested in: ${interestName(d.interest)}\n\nWant to start now? Create a free key (200 requests a day): ${SITE}/account/#api-keys${sign}`,
  };
}

const PLAN_NAME: Record<string, string> = { "api-pro": "API Plus", "api-business": "Business API" };
export const planName = (k?: string | null) => PLAN_NAME[String(k || "")] || String(k || "");

/** An upgrade request from the account dashboard: the account holder's acknowledgement. */
export function upgradeRequested(d: { name?: string | null; plan: string; volume?: string | null }): Email {
  return {
    subject: `We've got your ${planName(d.plan)} request`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Thanks for asking to move to ${b(esc(planName(d.plan)))}. We'll look at your request and reply, usually within one working day. Your keys keep working on their current plan until then.`) +
      facts([["Plan", esc(planName(d.plan))], ...(d.volume ? [["Expected volume", esc(d.volume)] as [string, string]] : [])]),
      { eyebrow: "Upgrade request", heading: "Request received.", title: "Upgrade request", reason: "you asked for an upgrade in your CricSynthesis account",
        links: API_LINKS, cta: "Open your account", ctaUrl: `${SITE}/account/#subscription` }),
    text: `Hi ${firstName(d.name)},\n\nThanks for asking to move to ${planName(d.plan)}. We'll reply, usually within one working day. Your keys keep working on their current plan until then.${sign}`,
  };
}

/** A job application's acknowledgement. */
export function applicationReceived(d: { name?: string | null; jobTitle: string }): Email {
  return {
    subject: `We've received your application: ${d.jobTitle}`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Thank you for applying for ${b(esc(d.jobTitle))} at CricSynthesis. We've received your application and resume.`) +
      p(`We review every application and will contact you if you are shortlisted. If you need to update anything, just reply to this email.`),
      { eyebrow: "Careers", heading: "Application received.", title: "Application received", reason: "you applied for a role at CricSynthesis",
        cta: "See our open roles", ctaUrl: `${SITE}/careers/` }),
    text: `Hi ${firstName(d.name)},\n\nThank you for applying for ${d.jobTitle} at CricSynthesis. We've received your application and resume.\n\nWe review every application and will contact you if you are shortlisted.${sign}`,
  };
}

/** Outcomes, sent from the admin console. */
export function applicationShortlisted(d: { name?: string | null; jobTitle: string; note?: string | null }): Email {
  return {
    subject: `Next steps for your application: ${d.jobTitle}`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Thank you for applying for ${b(esc(d.jobTitle))}. We enjoyed your application and would like to take it further.`) + note(d.note) +
      p(`We'll be in touch shortly to arrange the next step. If you have any questions in the meantime, reply to this email.`),
      { eyebrow: "Careers", heading: "You're shortlisted.", title: "Application update", reason: "you applied for a role at CricSynthesis",
        cta: "About CricSynthesis", ctaUrl: `${SITE}/about/` }),
    text: `Hi ${firstName(d.name)},\n\nThank you for applying for ${d.jobTitle}. We'd like to take your application further and will be in touch shortly to arrange the next step.` +
      `${d.note ? `\n\nNote from our team: ${d.note}` : ""}${sign}`,
  };
}
export function applicationDeclined(d: { name?: string | null; jobTitle: string; note?: string | null }): Email {
  return {
    subject: `Your application: ${d.jobTitle}`,
    html: layout(p(`Hi ${esc(firstName(d.name))},`) +
      p(`Thank you for applying for ${b(esc(d.jobTitle))} and for the time you put into your application.`) +
      p(`After careful review, we won't be taking your application further this time.`) + note(d.note) +
      p(`We'd be glad to hear from you again when a role fits, and we wish you the very best.`),
      { eyebrow: "Careers", heading: "Thank you for applying.", title: "Application update", reason: "you applied for a role at CricSynthesis",
        cta: "See our open roles", ctaUrl: `${SITE}/careers/` }),
    text: `Hi ${firstName(d.name)},\n\nThank you for applying for ${d.jobTitle}. After careful review, we won't be taking your application further this time.` +
      `${d.note ? `\n\nNote from our team: ${d.note}` : ""}\n\nWe wish you the very best.${sign}`,
  };
}

/** A plain notice to our own inbox (new API access request, upgrade request, application). */
export function teamNotice(d: { subject: string; heading: string; rows: [string, string][]; body?: string; link?: [string, string] }): Email {
  const rows = d.rows.filter(([, v]) => v);
  return {
    subject: d.subject,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1d1f20;max-width:620px">` +
      `<p style="margin:0 0 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#416180;font-weight:700">CricSynthesis · team notice</p>` +
      `<h2 style="margin:0 0 14px;font-size:20px">${esc(d.heading)}</h2>` +
      `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">${rows.map(([k, v]) =>
        `<tr><td style="border-top:1px solid #e4e5e7;color:#6b7075;width:34%;vertical-align:top">${esc(k)}</td><td style="border-top:1px solid #e4e5e7;vertical-align:top">${esc(v).replace(/\n/g, "<br>")}</td></tr>`).join("")}</table>` +
      (d.body ? `<p style="margin:14px 0 0;white-space:pre-line">${esc(d.body)}</p>` : "") +
      (d.link ? `<p style="margin:16px 0 0"><a href="${d.link[1]}" style="color:#416180;font-weight:700">${esc(d.link[0])} &rarr;</a></p>` : "") + `</div>`,
    text: `${d.heading}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}${d.body ? `\n\n${d.body}` : ""}${d.link ? `\n\n${d.link[0]}: ${d.link[1]}` : ""}`,
  };
}
