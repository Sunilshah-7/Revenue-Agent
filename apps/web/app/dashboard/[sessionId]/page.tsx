// A second, actually-live session-detail route at "/dashboard/[sessionId]"
// — distinct from the documented "/session/[id]" Live Session screen in
// CLAUDE.md, which is still seeded/simulated. This one is a real React
// Server Component: it calls getSession() server-side against the real
// GET /api/v1/sessions/:id proxy before rendering, then hands off to the
// client-side StreamPanel (which opens the real WebSocket) for live output.
import { StreamPanel } from "../../../components/StreamPanel";
import { getSession } from "../../../lib/api";

export default async function SessionDashboardPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const session = await getSession(params.sessionId);

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card grid" style={{ gap: 8 }}>
        <h1 style={{ margin: 0 }}>Session Dashboard</h1>
        <p style={{ margin: 0 }}>
          Session ID: <strong>{session.id}</strong>
        </p>
      </section>

      <StreamPanel sessionId={session.id} initialOutput={session.output} />
    </main>
  );
}
