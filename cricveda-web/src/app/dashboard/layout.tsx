import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import Link from "next/link";
import SignOutButton from "./SignOutButton";

export const metadata = { title: "Dashboard — CricVeda" };

const NAV = [
  { href: "/dashboard",       label: "Overview",   icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/dashboard/keys",  label: "API Keys",   icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" },
  { href: "/dashboard/usage", label: "Usage",      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, email, avatar_url")
    .eq("user_id", user.id)
    .single();

  const displayName = profile?.display_name || user.email?.split("@")[0] || "User";
  const avatarUrl = profile?.avatar_url;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg-primary, #06080d)" }}>
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r flex flex-col" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0b0e16" }}>
        {/* Logo */}
        <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M3 3v18h18" strokeLinecap="round" />
                <path d="M7 16l4-4 4 4 6-6" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-bold text-sm text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>CricVeda</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: "#9ca3b0" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User + sign out */}
        <div className="px-4 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5 mb-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{displayName}</p>
              <p className="text-xs truncate" style={{ color: "#6b7280" }}>{profile?.email || user.email}</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
