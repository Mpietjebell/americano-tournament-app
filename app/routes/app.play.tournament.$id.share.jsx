import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { loadTournament } from "../utils/tournament-actions.server";
import { buildJoinInviteText } from "../utils/tournament-helpers";

export const loader = async ({ params, request }) => {
    const tournament = await loadTournament(params.id);
    if (!tournament) throw new Response("Not Found", { status: 404 });
    const origin = new URL(request.url).origin;
    return json({ tournament, origin });
};

export default function SharePage() {
    const { tournament, origin } = useLoaderData();
    const [copied, setCopied] = useState(false);

    const joinUrl = `${origin}/app/play/join/${tournament.joinCode}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(joinUrl)}&size=240x240&margin=12&color=1C4F35`;

    const waText = encodeURIComponent(buildJoinInviteText(tournament, joinUrl));
    const whatsappUrl = `https://wa.me/?text=${waText}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <>
            <nav className="ios-nav">
                <Link to={`/app/play/tournament/${tournament.id}/overview`} className="ios-nav-back">
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Overview
                </Link>
                <span className="ios-nav-brand">NOPA</span>
                <span style={{ minWidth: 60 }} />
            </nav>

            <div className="ios-page" style={{ maxWidth: 560 }}>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "1.8rem", fontWeight: 400, color: "var(--label)", marginBottom: 6 }}>
                        Share with Players
                    </h1>
                    <p style={{ color: "var(--label-3)", fontSize: "0.86rem" }}>{tournament.name}</p>
                </div>

                <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", textAlign: "center", marginBottom: 18, padding: "22px 20px", boxShadow: "var(--shadow)" }}>
                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>Join Code</div>
                    <div style={{ fontSize: "3rem", fontWeight: 800, letterSpacing: "0.28em", color: "var(--green)", fontFamily: "monospace", background: "var(--bg-fill-2)", borderRadius: "var(--r-cell)", padding: "18px 24px", display: "inline-block", marginBottom: 10 }}>
                        {tournament.joinCode}
                    </div>
                    <p style={{ fontSize: "0.8rem", color: "var(--label-3)" }}>Players can enter this code in the NOPA join flow.</p>
                </div>

                <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", textAlign: "center", marginBottom: 18, padding: "20px", boxShadow: "var(--shadow)" }}>
                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>QR Code</div>
                    <img src={qrUrl} alt="QR Code" style={{ width: 200, height: 200, borderRadius: "var(--r-cell)", display: "block", margin: "0 auto 12px" }} />
                    <p style={{ fontSize: "0.8rem", color: "var(--label-3)" }}>Display it courtside for a faster join flow.</p>
                </div>

                <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", marginBottom: 18, padding: "18px", boxShadow: "var(--shadow)" }}>
                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>Share</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <a href={whatsappUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 16px", background: "#25D366", borderRadius: "var(--r-card)", color: "white", fontWeight: 600, fontSize: "0.92rem" }}>
                                Share on WhatsApp
                            </div>
                        </a>
                        <button type="button" onClick={handleCopy} style={{ padding: "14px 16px", background: copied ? "rgba(28,79,53,0.06)" : "var(--bg-fill-2)", borderRadius: "var(--r-card)", border: `1px solid ${copied ? "var(--green)" : "var(--sep)"}`, cursor: "pointer", fontWeight: 600, fontSize: "0.92rem", fontFamily: "inherit", color: copied ? "var(--green)" : "var(--label)" }}>
                            {copied ? "Link Copied" : "Copy Join Link"}
                        </button>
                        <div style={{ fontSize: "0.74rem", color: "var(--label-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{joinUrl}</div>
                    </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <a href={`/app/play/tournament/${tournament.id}/print.pdf`} download style={{ textDecoration: "none" }}>
                        <button style={{ width: "100%", padding: "14px 16px", borderRadius: "var(--r-card)", background: "var(--bg-card)", border: "1px solid var(--sep)", color: "var(--label)", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit", boxShadow: "var(--shadow)" }}>
                            Download Schedule PDF
                        </button>
                    </a>
                    <Link to={`/app/play/tournament/${tournament.id}`} style={{ textDecoration: "none" }}>
                        <button style={{ width: "100%", padding: "14px 16px", borderRadius: "var(--r-card)", background: "var(--green)", color: "white", border: "none", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(28,79,53,0.24)" }}>
                            Open Match Manager
                        </button>
                    </Link>
                </div>
            </div>
        </>
    );
}
