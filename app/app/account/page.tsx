"use client";
// Account dashboard: plan and subscription, API keys, profile. Signed-in only.
import { Dashboard } from "@/components/Dashboard";
import { RequireSignIn } from "@/components/Gate";

export default function AccountPage() {
  return (
    <div className="page-head dash" style={{ paddingBottom: 80 }}>
      <RequireSignIn><Dashboard /></RequireSignIn>
    </div>
  );
}
