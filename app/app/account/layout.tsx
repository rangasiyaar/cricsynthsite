import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/account/", "Account | CricSynthesis", "Your CricSynthesis account.", { noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
