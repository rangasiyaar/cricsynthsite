// The plans, in one place for the pricing page, the developers page, the account dashboard and the app.
// Fan plans: Free and CricSynthesis Pro (prices and copy in lib/pro.ts). API plans: Free, Plus, Business.
// API limits are enforced by the API Worker (edge/src/keys.ts PLANS); keep the numbers here in step with it.
import { FREE_HIGHLIGHTS, PRO, PRO_HIGHLIGHTS, rupees } from "./pro";

export const FAN_TIERS = [
  { id: "free", name: "Free", price: rupees(0), note: "No account needed", lines: FREE_HIGHLIGHTS },
  { id: "pro", name: PRO.name, price: rupees(PRO.monthly), note: `a month, or ${rupees(PRO.yearly)} a year. 1 day free.`, lines: PRO_HIGHLIGHTS },
];

export const API_PLUS = { monthly: 4999, yearly: 53989 } as const;   // yearly: 10% off

/** id = the plan stored on API keys (users/{uid}/keys/{slot}.plan); "pro" is shown as Plus. */
export const API_TIERS: { id: "free" | "pro" | "business"; name: string; price: string; per: string; note: string; lines: string[] }[] = [
  { id: "free", name: "API Free", price: rupees(0), per: "", note: "Create a key in your account",
    lines: ["200 API and MCP calls a day", "Every hosted endpoint and MCP tool", "Graphics carry a watermark", "Match Overview on the website and app"] },
  { id: "pro", name: "API Plus", price: rupees(API_PLUS.monthly), per: "/month", note: `or ${rupees(API_PLUS.yearly)} a year (save 10%)`,
    lines: ["20,000 API and MCP calls a day", "Every hosted endpoint and MCP tool", "Clean graphics, no watermark", "Larger simulations per request",
            "CricSynthesis Pro included on the website and app"] },
  { id: "business", name: "Business", price: "Contact sales", per: "", note: "Built around your product",
    lines: ["Custom limits", "A live dashboard built for you", "Every integration you need", "Priority support"] },
];
