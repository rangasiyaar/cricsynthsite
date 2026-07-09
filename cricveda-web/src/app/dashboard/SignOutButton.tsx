"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={signOut}
      className="w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors"
      style={{ color: "#6b7280" }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#f0f0f5"; }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#6b7280"; }}
    >
      Sign out
    </button>
  );
}
