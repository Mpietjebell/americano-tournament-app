import { Link } from "@remix-run/react";
import { MIN_MATCHES, FORM_WINDOW } from "../utils/scoring-rules";

export const meta = () => [
    { title: "How scoring works — NOPA Clubhouse" },
    { name: "description", content: "How points, rankings, sit-outs and club leaderboards work in a NOPA Clubhouse Americano." },
];

const FORMATS = [
    ["Americano", "New partner every round, drawn so you play with and against as many people as possible. Points are personal. Best for mixed groups."],
    ["Mexicano", "After every round the ranking decides the next courts: leaders meet leaders. Matches get closer as the evening goes on."],
    ["Team Americano", "You keep the same partner all night and play every other pair. Points count per team."],
    ["Team Mexicano", "Fixed pairs, but the ranking decides who you meet next."],
    ["King of the Court", "Winners move up a court, losers move down. The goal is to reach court 1 and stay there."],
    ["Beat the Box", "Winners stay on court, challengers queue up to knock them off."],
];

function Block({ step, title, children }) {
    return (
        <section className="nopa-card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--green)", color: "white", fontWeight: 700, fontSize: "0.8rem", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{step}</span>
                <h2 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>{title}</h2>
            </div>
            <div style={{ fontSize: "0.86rem", color: "var(--label-2)", lineHeight: 1.6 }}>{children}</div>
        </section>
    );
}

export default function Scoring() {
    return (
        <>
            <nav className="ios-nav">
                <Link to="/app/play" className="ios-nav-back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Home
                </Link>
                <span className="ios-nav-brand">NOPA</span>
                <span style={{ minWidth: 60 }} />
            </nav>
            <div className="ios-page" style={{ maxWidth: 560 }}>
                <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "2rem", fontWeight: 400, textAlign: "center", marginBottom: 6 }}>How scoring works</h1>
                <p style={{ textAlign: "center", color: "var(--label-3)", fontSize: "0.86rem", marginBottom: 18 }}>Every point counts, for everyone, all evening.</p>

                <Block step="1" title="A match is a fixed number of points">
                    The host picks the points per match — 21 is the usual. Every rally is one point and you play until all of them are gone,
                    so the two scores always add up to that number: <strong>12–9</strong>, <strong>15–6</strong>, <strong>11–10</strong>.
                    No sets, no tie-breaks, and every court finishes at about the same time.
                </Block>

                <Block step="2" title="You bank what your side scored">
                    Win 12–9 and both players on your side bank <strong>12</strong>; both opponents bank <strong>9</strong>.
                    Losing narrowly is still worth a lot, so nobody is out of it after one bad match.
                </Block>

                <Block step="3" title="The ranking is your total">
                    Your points from every round are added up. Most points wins the tournament; on a tie, the player with more
                    match wins is ahead. The standings update live after every confirmed score, and the last two rounds are hidden
                    to keep the finish exciting.
                </Block>

                <Block step="4" title="Sitting out does not cost you">
                    With more players than court places someone rests each round. For every round you sit out you are credited
                    <strong> your own average score</strong>, so everyone is compared over the same number of rounds. Your standings
                    row shows how many points came from that.
                </Block>

                <Block step="5" title="The host confirms every score">
                    Players can enter the score of their own match; it only counts once the host confirms it. The host can also
                    enter or correct any score, and decides when the final results are released.
                </Block>

                <h2 style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 700, margin: "22px 4px 8px" }}>Formats — who you play with</h2>
                <div className="nopa-feed" style={{ marginBottom: 12 }}>
                    {FORMATS.map(([name, text]) => (
                        <div key={name} style={{ padding: "12px 16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{name}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--label-3)", lineHeight: 1.5, marginTop: 2 }}>{text}</div>
                        </div>
                    ))}
                </div>

                <h2 style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 700, margin: "22px 4px 8px" }}>Club leaderboards — across tournaments</h2>
                <section className="nopa-card" style={{ fontSize: "0.86rem", color: "var(--label-2)", lineHeight: 1.6 }}>
                    <p style={{ margin: "0 0 10px" }}>
                        <strong>Form</strong> answers “who is playing best right now?”. It is the share of points you won in your matches
                        (12–9 is 57%), averaged over the club&apos;s last {FORM_WINDOW} tournaments. Because it is an average, playing more often
                        does not by itself push you up, and old results roll off. You need {MIN_MATCHES} matches in that window to be ranked;
                        with fewer you are listed as provisional, so two lucky matches cannot top the table.
                    </p>
                    <p style={{ margin: 0 }}>
                        <strong>All-time points</strong> answers “who has put in the most?”. Every point you ever scored in the club, added up.
                        It rewards showing up.
                    </p>
                </section>
            </div>
        </>
    );
}
