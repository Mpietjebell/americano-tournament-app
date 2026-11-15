import { useEffect, useState } from "react";
import { Link } from "@remix-run/react";

const KEY = "nopa_last_tournament";
const MAX_AGE = 1000 * 60 * 60 * 24 * 4; // four days

/**
 * Remembers the tournament someone was last in, on this phone. The
 * home-screen app always opens on the Clubhouse home, so this is what
 * takes a player straight back to their matches.
 */
export function useRememberTournament({ id, name, href, finished, enabled = true }) {
    useEffect(() => {
        if (!enabled) return;
        try {
            if (finished) {
                const saved = JSON.parse(localStorage.getItem(KEY) || "null");
                if (saved?.id === id) localStorage.removeItem(KEY);
                return;
            }
            localStorage.setItem(KEY, JSON.stringify({ id, name, href, at: Date.now() }));
        } catch { /* private mode */ }
    }, [id, name, href, finished, enabled]);
}

export function ResumeCard() {
    const [last, setLast] = useState(null);
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY) || "null");
            if (saved?.href?.startsWith("/app/play/") && Date.now() - saved.at < MAX_AGE) setLast(saved);
        } catch { /* private mode */ }
    }, []);
    if (!last) return null;
    return (
        <Link to={last.href} className="club-resume">
            <div>
                <div className="club-eyebrow">Pick up where you left off</div>
                <strong>{last.name}</strong>
            </div>
            <span aria-hidden="true">→</span>
        </Link>
    );
}
