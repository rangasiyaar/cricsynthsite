interface PlayerPageProps {
  params: { id: string };
}

export default function PlayerPage({ params }: PlayerPageProps) {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Player Form</h1>
      <p>Player ID: {params.id}</p>
      <p>Placeholder for CricVeda player form card.</p>
    </main>
  );
}

