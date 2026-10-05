import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase-server";

export const metadata = { title: "Admin — CricSynthesis" };

const NAV = [
  { href: "/admin/fixtures", label: "Fixtures & squads" },
  { href: "/admin/users", label: "Users & plans" },
  { href: "/dashboard", label: "← Back to dashboard" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, email")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "#06080d" }}>
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold text-white mb-2">Admins only</h1>
          <p className="text-sm mb-6" style={{ color: "#9ca3b0" }}>
            {profile?.email ?? user.email} doesn&apos;t have admin access. Ask an existing admin to set
            <code className="mx-1">is_admin</code>on your profile.
          </p>
          <Link href="/dashboard" className="text-sm" style={{ color: "#818cf8" }}>Go to dashboard →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#06080d" }}>
      <aside className="w-56 flex-shrink-0 border-r flex flex-col" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0b0e16" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <p className="font-bold text-sm text-white">CricSynthesis</p>
          <p className="text-xs" style={{ color: "#f59e0b" }}>Admin</p>
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="px-3 py-2 rounded-lg text-sm hover:bg-white/5" style={{ color: "#9ca3b0" }}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
