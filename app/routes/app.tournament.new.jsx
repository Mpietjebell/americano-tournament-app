import { json, redirect } from "@remix-run/node";
import { useActionData, useNavigation, Form } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createHostCookie } from "../utils/host-auth.server";
import { getMinimumPlayers } from "../utils/tournament-helpers";
import { GAME_MODE_BUTTON_IMAGES } from "../utils/game-mode-icons";

export const action = async ({ request }) => {
    await authenticate.admin(request);
    const formData = await request.formData();
    const name = formData.get("name");
    const type = formData.get("type");
    const courts = parseInt(formData.get("courts"), 10) || 2;
    const pointsPerMatch = parseInt(formData.get("pointsPerMatch"), 10) || 24;
    const playersRaw = formData.get("players");

    if (!name || !type || !playersRaw) {
        return json({ error: "Please fill in all fields and add at least 4 players." }, { status: 400 });
    }

    let playerNames;
    try {
        playerNames = JSON.parse(playersRaw);
    } catch {
        return json({ error: "Invalid player data." }, { status: 400 });
    }

    const minPlayers = getMinimumPlayers(type);
    if (playerNames.length < minPlayers) {
        return json({ error: `You need at least ${minPlayers} players to start this tournament.` }, { status: 400 });
    }

    if ((type === "team_americano" || type === "team_mexicano") && playerNames.length % 2 !== 0) {
        return json({ error: "Fixed-team formats need an even number of players." }, { status: 400 });
    }

    const tournament = await prisma.tournament.create({
        data: {
            name,
            type,
            courtsAvailable: courts,
            pointsPerMatch,
            players: {
                create: playerNames.map((p, index) => ({
                    name: p.name,
                    gender: p.gender || "unspecified",
                    teamId: p.teamId || (type === "team_americano" || type === "team_mexicano" ? `team-${Math.floor(index / 2) + 1}` : null),
                })),
            },
        },
    });

    return redirect(`/app/tournament/${tournament.id}`, {
        headers: {
            "Set-Cookie": createHostCookie(tournament.id, tournament.hostToken),
        },
    });
};

const PLAY_TYPES = [
    { id: "americano", name: "Americano", desc: "Rotating partners, individual points" },
    { id: "mexicano", name: "Mexicano", desc: "Performance-based Swiss System" },
    { id: "team_americano", name: "Team Americano", desc: "Fixed partners, rotating opponents" },
    { id: "team_mexicano", name: "Team Mexicano", desc: "Fixed partners, ranking-based courts" },
    { id: "king_of_the_court", name: "King of the Court", desc: "Winners move up, losers move down" },
    { id: "beat_the_box", name: "Beat the Box", desc: "King of the Court, winner stays" },
];

export default function NewTournament() {
    const actionData = useActionData();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    const [selectedType, setSelectedType] = useState("americano");
    const [players, setPlayers] = useState([]);
    const [playerName, setPlayerName] = useState("");
    const minPlayers = getMinimumPlayers(selectedType);

    const addPlayer = () => {
        const trimmed = playerName.trim();
        if (!trimmed) return;
        if (players.find((p) => p.name === trimmed)) return;
        setPlayers([...players, { name: trimmed, gender: "unspecified" }]);
        setPlayerName("");
    };

    const removePlayer = (name) => {
        setPlayers(players.filter((p) => p.name !== name));
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            addPlayer();
        }
    };

    return (
        <div className="nopa-app">
            <link rel="stylesheet" href="/app/styles/nopa-theme.css" />
            <div className="nopa-topbar">
                <h1>NOPA Padel</h1>
            </div>
            <div className="nopa-page">
                <div className="nopa-page-header">
                    <h2 className="nopa-title">New Tournament</h2>
                    <p>Set up your Padel tournament</p>
                </div>

                <Form method="post">
                    {actionData?.error && (
                        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 20, color: "#991b1b", fontSize: "0.9rem" }}>
                            {actionData.error}
                        </div>
                    )}

                    {/* Tournament Name */}
                    <div className="nopa-form-group">
                        <label className="nopa-label">Tournament Name</label>
                        <input className="nopa-input" name="name" placeholder="Friday Night Padel" required />
                    </div>

                    {/* Playtype Selector */}
                    <div className="nopa-form-group">
                        <label className="nopa-label">Play Type</label>
                        <div className="nopa-playtype-grid">
                            {PLAY_TYPES.map((pt) => (
                                <button
                                    key={pt.id}
                                    type="button"
                                    onClick={() => setSelectedType(pt.id)}
                                    style={{
                                        border: selectedType === pt.id ? "1.5px solid var(--nopa-green)" : "1px solid rgba(28,79,53,0.14)",
                                        borderRadius: 22,
                                        background: selectedType === pt.id ? "rgba(28,79,53,0.05)" : "white",
                                        boxShadow: selectedType === pt.id ? "0 14px 24px rgba(28,79,53,0.12)" : "0 8px 18px rgba(15,23,42,0.06)",
                                        padding: "10px 8px 9px",
                                        textAlign: "center",
                                        cursor: "pointer",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 8,
                                        minHeight: 134,
                                        fontFamily: "inherit",
                                    }}
                                >
                                    <img
                                        src={GAME_MODE_BUTTON_IMAGES[pt.id]}
                                        alt={pt.name}
                                        style={{ width: "min(100%, 68px)", aspectRatio: "1 / 1", objectFit: "contain", display: "block" }}
                                    />
                                    <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                                        <h3 style={{ margin: 0, fontSize: "0.76rem", lineHeight: 1.15, color: selectedType === pt.id ? "var(--nopa-green)" : "#21352b" }}>{pt.name}</h3>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <input type="hidden" name="type" value={selectedType} />
                    </div>

                    {/* Courts & Points */}
                    <div className="nopa-form-row">
                        <div>
                            <label className="nopa-label">Courts Available</label>
                            <input className="nopa-input" name="courts" type="number" min="1" max="10" defaultValue="2" />
                        </div>
                        <div>
                            <label className="nopa-label">Points per Match</label>
                            <input className="nopa-input" name="pointsPerMatch" type="number" min="1" defaultValue="24" />
                        </div>
                    </div>

                    {/* Add Players */}
                    <div className="nopa-form-group">
                        <label className="nopa-label">Players ({players.length} added — min 4)</label>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                className="nopa-input"
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Player name..."
                                style={{ flex: 1 }}
                            />
                            <button type="button" className="nopa-btn nopa-btn-secondary nopa-btn-small" onClick={addPlayer}>
                                Add
                            </button>
                        </div>
                        <div className="nopa-players-grid">
                            {players.map((p) => (
                                <div key={p.name} className="nopa-player-badge">
                                    <span>{p.name}</span>
                                    <button type="button" className="remove" onClick={() => removePlayer(p.name)}>×</button>
                                </div>
                            ))}
                        </div>
                        <input type="hidden" name="players" value={JSON.stringify(players)} />
                    </div>

                    {/* Submit */}
                    <div style={{ textAlign: "center", marginTop: 32 }}>
                        <button
                            type="submit"
                            className="nopa-btn nopa-btn-primary"
                            disabled={players.length < minPlayers || isSubmitting}
                        >
                            {isSubmitting ? "Creating..." : players.length < minPlayers
                                ? `Add ${minPlayers - players.length} more players`
                                : "Start Tournament"}
                        </button>
                    </div>
                </Form>
            </div>
        </div>
    );
}
