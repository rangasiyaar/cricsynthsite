import type { Metadata } from "next";
import { seo } from "@/lib/seo";

export const metadata: Metadata = seo("/login/", "Sign in | CricSynthesis", "Sign in to CricSynthesis.", { noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
