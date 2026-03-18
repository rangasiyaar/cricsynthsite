interface MatchPageProps {
  params: { id: string };
}

export default function MatchDetailPage({ params }: MatchPageProps) {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Match Insights</h1>
      <p>Match ID: {params.id}</p>
      <p>Placeholder for per-match CricVeda insights and recommendations.</p>
    </main>
  );
}

