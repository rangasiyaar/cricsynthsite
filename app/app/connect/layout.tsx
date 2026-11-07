import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/connect/", "Connect an AI assistant | CricSynthesis",
  "Allow an AI assistant to use the CricSynthesis MCP connector with your account.", { noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
