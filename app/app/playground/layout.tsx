import type { Metadata } from "next";

export const metadata: Metadata = { title: "API playground | CricSynthesis" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
