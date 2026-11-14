import { useEffect, useState } from "react";

/**
 * The wait between the last match and the host releasing the results.
 * A sealed podium: three plinths whose scores keep spinning like a
 * scoreboard that hasn't settled, with facts about the tournament that
 * give nothing away. No real standings are used here — the numbers are
 * random, so nothing can leak.
 */
export function SealedResults({ tournament, yourScore }) {
    const matches = tournament.rounds.reduce((n, r) => n + r.matches.length, 0);
    const rounds = tournament.rounds.length;
    const playerCount = tournament.players.length;
    const contested = matches * tournament.pointsPerMatch;
    const facts = [
        `${matches} matches played`,
        `${contested} points contested`,
        `${playerCount} players, one winner`,
        `${rounds} rounds, all scores in`,
        "The host is checking the card",
    ];

    const low = Math.max(10, Math.round(tournament.pointsPerMatch * rounds * 0.35));
    const high = Math.max(low + 9, Math.round(tournament.pointsPerMatch * rounds * 0.7));
    const [spin, setSpin] = useState(["··", "··", "··"]);
    const [fact, setFact] = useState(0);

    useEffect(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            setSpin(["?", "?", "?"]);
            return;
        }
        const roll = () => String(low + Math.floor(Math.random() * (high - low + 1)));
        const spinTimer = setInterval(() => setSpin([roll(), roll(), roll()]), 110);
        const factTimer = setInterval(() => setFact((i) => i + 1), 2800);
        return () => { clearInterval(spinTimer); clearInterval(factTimer); };
    }, [low, high]);

    return (
        <section className="sealed" aria-label="Results not released yet">
            <div className="club-eyebrow sealed-eyebrow">The results are sealed</div>
            <h2 className="sealed-title">Who took it?</h2>

            <div className="sealed-podium" aria-hidden="true">
                {[1, 0, 2].map((rank) => (
                    <div key={rank} className={`sealed-plinth sealed-plinth-${rank + 1}`}>
                        <div className="sealed-face">?</div>
                        <div className="sealed-bar">
                            <span className="sealed-rank">{rank + 1}</span>
                            <span className="sealed-score">{spin[rank]}</span>
                            <span className="sealed-pts">pts</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="sealed-fact" key={fact}>{facts[fact % facts.length]}</div>
            <div className="sealed-drum" aria-hidden="true"><i /><i /><i /></div>

            {yourScore != null && (
                <div className="sealed-yours">
                    <span>Your score</span>
                    <strong>{yourScore}</strong>
                </div>
            )}
            <p className="sealed-note">This opens by itself the moment the host releases the results.</p>
        </section>
    );
}
