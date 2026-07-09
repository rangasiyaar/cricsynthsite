import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <p className="text-6xl font-bold font-mono text-[#111621]">404</p>
      <h2 className="text-xl font-display font-semibold text-white">Page not found</h2>
      <p className="text-sm text-[#6b7280]">This page doesn't exist or has been moved.</p>
      <Link href="/" className="btn-primary mt-2">← Back to matches</Link>
    </div>
  );
}
