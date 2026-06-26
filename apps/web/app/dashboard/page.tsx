import Link from "next/link";

export default function DashboardIndexPage() {
  return (
    <main>
      <section className="card grid">
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <p style={{ margin: 0 }}>
          Start a session from the home page, then open it at{" "}
          <code>/dashboard/&lt;sessionId&gt;</code>.
        </p>
        <Link href="/">Go to Home</Link>
      </section>
    </main>
  );
}
