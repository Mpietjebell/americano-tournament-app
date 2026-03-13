import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const tournaments = await prisma.tournament.findMany({
    include: { players: true, rounds: true },
    orderBy: { createdAt: "desc" },
  });
  return json({ tournaments });
};

export default function TournamentsHome() {
  const { tournaments } = useLoaderData();

  return (
    <div className="nopa-app">
      <link rel="stylesheet" href="/app/styles/nopa-theme.css" />
      <div className="nopa-topbar">
        <h1>NOPA Padel</h1>
      </div>
      <div className="nopa-page">
        <div className="nopa-page-header">
          <h2 className="nopa-title">Tournaments</h2>
          <p>Manage your Padel tournaments</p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <Link to="/app/tournament/new" style={{ textDecoration: "none" }}>
            <button className="nopa-btn nopa-btn-primary">+ New Tournament</button>
          </Link>
        </div>

        {tournaments.length === 0 ? (
          <div className="nopa-empty">
            <div className="nopa-empty-icon">🏸</div>
            <h3 className="nopa-title">No Tournaments Yet</h3>
            <p>Create your first tournament to get started.</p>
          </div>
        ) : (
          <div className="nopa-tournament-list">
            {tournaments.map((t) => (
              <Link
                key={t.id}
                to={`/app/tournament/${t.id}`}
                className="nopa-tournament-item"
              >
                <div>
                  <div className="nopa-card-title" style={{ marginBottom: 4 }}>{t.name}</div>
                  <div className="nopa-card-header">
                    {t.type.replace("_", " ").toUpperCase()} · {t.players.length} players · {t.courtsAvailable} courts
                  </div>
                </div>
                <div className="nopa-tournament-meta">
                  <span className={`nopa-badge nopa-badge-${t.status}`}>
                    {t.status}
                  </span>
                  <span style={{ color: "var(--nopa-green)", fontSize: "1.2rem" }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
