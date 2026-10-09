// Plain text pages (privacy, terms, careers, contact) in the website's legal-page layout.
export default function Legal({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="legal-page">
      <div className="legal-header">
        <h1 className="legal-title">{title}</h1>
        {subtitle && <p className="legal-subtitle">{subtitle}</p>}
      </div>
      <div className="legal-content">{children}</div>
    </section>
  );
}
