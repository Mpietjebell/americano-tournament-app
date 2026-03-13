import { Link } from "@remix-run/react";
import { GAME_MODE_ICONS, GAME_MODE_ICONS_FLAT } from "../utils/game-mode-icons";
import { TYPE_LABELS } from "../utils/tournament-helpers";

const ORDER = [
  "king_of_the_court",
  "americano",
  "mexicano",
  "team_americano",
  "team_mexicano",
  "beat_the_box",
];

export default function GameModeIconPreview() {
  return (
    <>
      <nav className="ios-nav">
        <Link to="/app/play" className="ios-nav-back">
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Home
        </Link>
        <span className="ios-nav-brand">NOPA</span>
        <span style={{ minWidth: 64 }} />
      </nav>
      <div className="ios-page" style={{ maxWidth: 960 }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "2.2rem", fontWeight: 500, color: "var(--label)", marginBottom: 8 }}>Game Mode Icons</h1>
          <p style={{ fontSize: "0.92rem", color: "var(--label-3)" }}>Primary glossy badges and flat mobile variants.</p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>Primary</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(136px, 1fr))", gap: 16 }}>
            {ORDER.map((key) => (
              <div key={key} style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: 16, boxShadow: "var(--shadow)", textAlign: "center" }}>
                <img src={GAME_MODE_ICONS[key]} alt={TYPE_LABELS[key]} style={{ width: 104, height: 104, objectFit: "contain", display: "block", margin: "0 auto 12px" }} />
                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "var(--label)" }}>{TYPE_LABELS[key]}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--label-3)", marginTop: 4 }}>{GAME_MODE_ICONS[key]}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>Flat Mobile</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(136px, 1fr))", gap: 16 }}>
            {ORDER.map((key) => (
              <div key={key} style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: 16, boxShadow: "var(--shadow)", textAlign: "center" }}>
                <div style={{ width: 72, height: 72, margin: "0 auto 12px", borderRadius: 20, background: "rgba(28,79,53,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img src={GAME_MODE_ICONS_FLAT[key]} alt={`${TYPE_LABELS[key]} flat`} style={{ width: 44, height: 44, objectFit: "contain", display: "block" }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: "0.86rem", color: "var(--label)" }}>{TYPE_LABELS[key]}</div>
                <div style={{ fontSize: "0.68rem", color: "var(--label-3)", marginTop: 4 }}>{GAME_MODE_ICONS_FLAT[key]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
