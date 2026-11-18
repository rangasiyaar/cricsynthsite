// Plain text pages (privacy, terms, careers, contact) in the website's legal-page layout.
export default function Legal({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  // a long word (CANCELLATION, Shipping…) doesn't fit the title column at full size: step the size down
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  const size = longest > 10 ? " legal-title--xl" : longest > 8 ? " legal-title--l" : "";
  return (
    <section className="legal-page">
      <div className="legal-header">
        <h1 className={`legal-title${size}`}>{title}</h1>
        {subtitle && <p className="legal-subtitle">{subtitle}</p>}
      </div>
      <div className="legal-content">{children}</div>
    </section>
  );
}
