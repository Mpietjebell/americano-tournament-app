import { json, redirect } from "@remix-run/node";
import { useActionData, useNavigation, Form, Link } from "@remix-run/react";
import { useState } from "react";
import prisma from "../db.server";
import { createHostCookie } from "../utils/host-auth.server";
import { buildTeams, getMinimumPlayers, getTournamentStats } from "../utils/tournament-helpers";
import { GAME_MODE_BUTTON_IMAGES } from "../utils/game-mode-icons";

function getUserIdFromCookie(request) {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/nopa_user=([^;]+)/);
    return match ? match[1] : null;
}

function generateJoinCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

export const action = async ({ request }) => {
    const userId = getUserIdFromCookie(request);
    const formData = await request.formData();
    const name = formData.get("name");
    const location = formData.get("location");
    const country = formData.get("country") || "";
    const logoUrl = formData.get("logoUrl") || null;
    const type = formData.get("type");
    const courts = parseInt(formData.get("courts"), 10) || 2;
    const pointsPerMatch = parseInt(formData.get("pointsPerMatch"), 10) || 24;
    const deuceMethod = formData.get("deuceMethod") || "deuce";
    const isPublic = formData.get("isPublic") !== "false";
    const courtNamesRaw = formData.get("courtNames");
    const playersRaw = formData.get("players");

    if (!name || !location || !type || !playersRaw) {
        return json({ error: "Please fill in all required fields and add at least 4 players." }, { status: 400 });
    }

    let playerNames;
    try { playerNames = JSON.parse(playersRaw); } catch { return json({ error: "Invalid player data." }, { status: 400 }); }

    const minPlayers = getMinimumPlayers(type);
    if (playerNames.length < minPlayers) {
        return json({ error: `You need at least ${minPlayers} players to start this tournament.` }, { status: 400 });
    }

    if ((type === "team_americano" || type === "team_mexicano") && playerNames.length % 2 !== 0) {
        return json({ error: "Fixed-team formats need an even number of players." }, { status: 400 });
    }

    let courtNames = null;
    try { if (courtNamesRaw) courtNames = JSON.stringify(JSON.parse(courtNamesRaw)); } catch { /* ignore */ }

    // Generate unique join code
    let joinCode;
    let attempts = 0;
    do {
        joinCode = generateJoinCode();
        const existing = await prisma.tournament.findUnique({ where: { joinCode } });
        if (!existing) break;
        attempts++;
    } while (attempts < 10);

    const tournament = await prisma.tournament.create({
        data: {
            name,
            location,
            country,
            logoUrl,
            type,
            courtsAvailable: courts,
            pointsPerMatch,
            deuceMethod,
            isPublic,
            joinCode,
            courtNames,
            isGuest: !userId,
            createdById: userId || null,
            players: {
                create: playerNames.map((p, index) => ({
                    name: p.name,
                    gender: p.gender || "unspecified",
                    teamId: p.teamId || (type === "team_americano" || type === "team_mexicano" ? `team-${Math.floor(index / 2) + 1}` : null),
                })),
            },
        },
    });

    return redirect(`/app/play/tournament/${tournament.id}/overview`, {
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

const DEUCE_METHODS = [
    { id: "deuce", label: "Deuce" },
    { id: "golden_point", label: "Golden Point" },
    { id: "starpoint", label: "Starpoint" },
    { id: "tie_break", label: "Tie Break" },
];

const POINTS_PRESETS = {
    americano: [12, 24, 32],
    mexicano: [12, 24, 32],
    team_americano: [12, 24, 32],
    team_mexicano: [12, 24, 32],
    king_of_the_court: [12, 24, 32],
    beat_the_box: [12, 24, 32],
};

function getFormatCapacityInfo(type, playerCount, courts) {
    const supported = new Set(["americano", "mexicano", "team_americano", "team_mexicano", "king_of_the_court"]);
    const typeName = PLAY_TYPES.find((item) => item.id === type)?.name || type;
    const activeCourts = Math.min(courts, Math.floor(playerCount / 4));
    const byePlayers = Math.max(0, playerCount - activeCourts * 4);
    const fullSetupPlayers = courts * 4;
    const minPlayers = getMinimumPlayers(type);
    if (!supported.has(type)) return { activeCourts: courts, byePlayers: 0, warning: null };
    if (playerCount < minPlayers) {
        return {
            activeCourts: 0,
            byePlayers: playerCount,
            warning: `${typeName} needs at least ${minPlayers} players to start. A full ${courts}-court setup uses ${fullSetupPlayers} players.`,
        };
    }
    if (activeCourts < courts) {
        return {
            activeCourts,
            byePlayers,
            warning: `A full ${courts}-court ${typeName} setup needs ${fullSetupPlayers} players. With ${playerCount} players, this tournament will use ${activeCourts} active court${activeCourts === 1 ? "" : "s"} and ${byePlayers} bye/rest/reserve player${byePlayers === 1 ? "" : "s"} each round.`,
        };
    }
    if (playerCount % 4 !== 0) {
        return {
            activeCourts,
            byePlayers,
            warning: `A full ${courts}-court ${typeName} setup needs ${fullSetupPlayers} players. With ${playerCount} players, ${byePlayers} bye/rest/reserve player${byePlayers === 1 ? "" : "s"} will rotate each round.`,
        };
    }
    return { activeCourts, byePlayers: 0, warning: null };
}

const COUNTRIES = [
    { code: "AF", name: "Afghanistan", flag: "🇦🇫" },
    { code: "AL", name: "Albania", flag: "🇦🇱" },
    { code: "DZ", name: "Algeria", flag: "🇩🇿" },
    { code: "AD", name: "Andorra", flag: "🇦🇩" },
    { code: "AO", name: "Angola", flag: "🇦🇴" },
    { code: "AG", name: "Antigua and Barbuda", flag: "🇦🇬" },
    { code: "AR", name: "Argentina", flag: "🇦🇷" },
    { code: "AM", name: "Armenia", flag: "🇦🇲" },
    { code: "AU", name: "Australia", flag: "🇦🇺" },
    { code: "AT", name: "Austria", flag: "🇦🇹" },
    { code: "AZ", name: "Azerbaijan", flag: "🇦🇿" },
    { code: "BS", name: "Bahamas", flag: "🇧🇸" },
    { code: "BH", name: "Bahrain", flag: "🇧🇭" },
    { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
    { code: "BB", name: "Barbados", flag: "🇧🇧" },
    { code: "BY", name: "Belarus", flag: "🇧🇾" },
    { code: "BE", name: "Belgium", flag: "🇧🇪" },
    { code: "BZ", name: "Belize", flag: "🇧🇿" },
    { code: "BJ", name: "Benin", flag: "🇧🇯" },
    { code: "BT", name: "Bhutan", flag: "🇧🇹" },
    { code: "BO", name: "Bolivia", flag: "🇧🇴" },
    { code: "BA", name: "Bosnia and Herzegovina", flag: "🇧🇦" },
    { code: "BW", name: "Botswana", flag: "🇧🇼" },
    { code: "BR", name: "Brazil", flag: "🇧🇷" },
    { code: "BN", name: "Brunei", flag: "🇧🇳" },
    { code: "BG", name: "Bulgaria", flag: "🇧🇬" },
    { code: "BF", name: "Burkina Faso", flag: "🇧🇫" },
    { code: "BI", name: "Burundi", flag: "🇧🇮" },
    { code: "CV", name: "Cabo Verde", flag: "🇨🇻" },
    { code: "KH", name: "Cambodia", flag: "🇰🇭" },
    { code: "CM", name: "Cameroon", flag: "🇨🇲" },
    { code: "CA", name: "Canada", flag: "🇨🇦" },
    { code: "CF", name: "Central African Republic", flag: "🇨🇫" },
    { code: "TD", name: "Chad", flag: "🇹🇩" },
    { code: "CL", name: "Chile", flag: "🇨🇱" },
    { code: "CN", name: "China", flag: "🇨🇳" },
    { code: "CO", name: "Colombia", flag: "🇨🇴" },
    { code: "KM", name: "Comoros", flag: "🇰🇲" },
    { code: "CG", name: "Congo", flag: "🇨🇬" },
    { code: "CR", name: "Costa Rica", flag: "🇨🇷" },
    { code: "HR", name: "Croatia", flag: "🇭🇷" },
    { code: "CU", name: "Cuba", flag: "🇨🇺" },
    { code: "CY", name: "Cyprus", flag: "🇨🇾" },
    { code: "CZ", name: "Czech Republic", flag: "🇨🇿" },
    { code: "DK", name: "Denmark", flag: "🇩🇰" },
    { code: "DJ", name: "Djibouti", flag: "🇩🇯" },
    { code: "DM", name: "Dominica", flag: "🇩🇲" },
    { code: "DO", name: "Dominican Republic", flag: "🇩🇴" },
    { code: "EC", name: "Ecuador", flag: "🇪🇨" },
    { code: "EG", name: "Egypt", flag: "🇪🇬" },
    { code: "SV", name: "El Salvador", flag: "🇸🇻" },
    { code: "GQ", name: "Equatorial Guinea", flag: "🇬🇶" },
    { code: "ER", name: "Eritrea", flag: "🇪🇷" },
    { code: "EE", name: "Estonia", flag: "🇪🇪" },
    { code: "SZ", name: "Eswatini", flag: "🇸🇿" },
    { code: "ET", name: "Ethiopia", flag: "🇪🇹" },
    { code: "FJ", name: "Fiji", flag: "🇫🇯" },
    { code: "FI", name: "Finland", flag: "🇫🇮" },
    { code: "FR", name: "France", flag: "🇫🇷" },
    { code: "GA", name: "Gabon", flag: "🇬🇦" },
    { code: "GM", name: "Gambia", flag: "🇬🇲" },
    { code: "GE", name: "Georgia", flag: "🇬🇪" },
    { code: "DE", name: "Germany", flag: "🇩🇪" },
    { code: "GH", name: "Ghana", flag: "🇬🇭" },
    { code: "GR", name: "Greece", flag: "🇬🇷" },
    { code: "GD", name: "Grenada", flag: "🇬🇩" },
    { code: "GT", name: "Guatemala", flag: "🇬🇹" },
    { code: "GN", name: "Guinea", flag: "🇬🇳" },
    { code: "GW", name: "Guinea-Bissau", flag: "🇬🇼" },
    { code: "GY", name: "Guyana", flag: "🇬🇾" },
    { code: "HT", name: "Haiti", flag: "🇭🇹" },
    { code: "HN", name: "Honduras", flag: "🇭🇳" },
    { code: "HU", name: "Hungary", flag: "🇭🇺" },
    { code: "IS", name: "Iceland", flag: "🇮🇸" },
    { code: "IN", name: "India", flag: "🇮🇳" },
    { code: "ID", name: "Indonesia", flag: "🇮🇩" },
    { code: "IR", name: "Iran", flag: "🇮🇷" },
    { code: "IQ", name: "Iraq", flag: "🇮🇶" },
    { code: "IE", name: "Ireland", flag: "🇮🇪" },
    { code: "IL", name: "Israel", flag: "🇮🇱" },
    { code: "IT", name: "Italy", flag: "🇮🇹" },
    { code: "JM", name: "Jamaica", flag: "🇯🇲" },
    { code: "JP", name: "Japan", flag: "🇯🇵" },
    { code: "JO", name: "Jordan", flag: "🇯🇴" },
    { code: "KZ", name: "Kazakhstan", flag: "🇰🇿" },
    { code: "KE", name: "Kenya", flag: "🇰🇪" },
    { code: "KI", name: "Kiribati", flag: "🇰🇮" },
    { code: "KW", name: "Kuwait", flag: "🇰🇼" },
    { code: "KG", name: "Kyrgyzstan", flag: "🇰🇬" },
    { code: "LA", name: "Laos", flag: "🇱🇦" },
    { code: "LV", name: "Latvia", flag: "🇱🇻" },
    { code: "LB", name: "Lebanon", flag: "🇱🇧" },
    { code: "LS", name: "Lesotho", flag: "🇱🇸" },
    { code: "LR", name: "Liberia", flag: "🇱🇷" },
    { code: "LY", name: "Libya", flag: "🇱🇾" },
    { code: "LI", name: "Liechtenstein", flag: "🇱🇮" },
    { code: "LT", name: "Lithuania", flag: "🇱🇹" },
    { code: "LU", name: "Luxembourg", flag: "🇱🇺" },
    { code: "MG", name: "Madagascar", flag: "🇲🇬" },
    { code: "MW", name: "Malawi", flag: "🇲🇼" },
    { code: "MY", name: "Malaysia", flag: "🇲🇾" },
    { code: "MV", name: "Maldives", flag: "🇲🇻" },
    { code: "ML", name: "Mali", flag: "🇲🇱" },
    { code: "MT", name: "Malta", flag: "🇲🇹" },
    { code: "MH", name: "Marshall Islands", flag: "🇲🇭" },
    { code: "MR", name: "Mauritania", flag: "🇲🇷" },
    { code: "MU", name: "Mauritius", flag: "🇲🇺" },
    { code: "MX", name: "Mexico", flag: "🇲🇽" },
    { code: "FM", name: "Micronesia", flag: "🇫🇲" },
    { code: "MD", name: "Moldova", flag: "🇲🇩" },
    { code: "MC", name: "Monaco", flag: "🇲🇨" },
    { code: "MN", name: "Mongolia", flag: "🇲🇳" },
    { code: "ME", name: "Montenegro", flag: "🇲🇪" },
    { code: "MA", name: "Morocco", flag: "🇲🇦" },
    { code: "MZ", name: "Mozambique", flag: "🇲🇿" },
    { code: "MM", name: "Myanmar", flag: "🇲🇲" },
    { code: "NA", name: "Namibia", flag: "🇳🇦" },
    { code: "NR", name: "Nauru", flag: "🇳🇷" },
    { code: "NP", name: "Nepal", flag: "🇳🇵" },
    { code: "NL", name: "Netherlands", flag: "🇳🇱" },
    { code: "NZ", name: "New Zealand", flag: "🇳🇿" },
    { code: "NI", name: "Nicaragua", flag: "🇳🇮" },
    { code: "NE", name: "Niger", flag: "🇳🇪" },
    { code: "NG", name: "Nigeria", flag: "🇳🇬" },
    { code: "NO", name: "Norway", flag: "🇳🇴" },
    { code: "OM", name: "Oman", flag: "🇴🇲" },
    { code: "PK", name: "Pakistan", flag: "🇵🇰" },
    { code: "PW", name: "Palau", flag: "🇵🇼" },
    { code: "PA", name: "Panama", flag: "🇵🇦" },
    { code: "PG", name: "Papua New Guinea", flag: "🇵🇬" },
    { code: "PY", name: "Paraguay", flag: "🇵🇾" },
    { code: "PE", name: "Peru", flag: "🇵🇪" },
    { code: "PH", name: "Philippines", flag: "🇵🇭" },
    { code: "PL", name: "Poland", flag: "🇵🇱" },
    { code: "PT", name: "Portugal", flag: "🇵🇹" },
    { code: "QA", name: "Qatar", flag: "🇶🇦" },
    { code: "RO", name: "Romania", flag: "🇷🇴" },
    { code: "RU", name: "Russia", flag: "🇷🇺" },
    { code: "RW", name: "Rwanda", flag: "🇷🇼" },
    { code: "KN", name: "Saint Kitts and Nevis", flag: "🇰🇳" },
    { code: "LC", name: "Saint Lucia", flag: "🇱🇨" },
    { code: "VC", name: "Saint Vincent and the Grenadines", flag: "🇻🇨" },
    { code: "WS", name: "Samoa", flag: "🇼🇸" },
    { code: "SM", name: "San Marino", flag: "🇸🇲" },
    { code: "ST", name: "São Tomé and Príncipe", flag: "🇸🇹" },
    { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
    { code: "SN", name: "Senegal", flag: "🇸🇳" },
    { code: "RS", name: "Serbia", flag: "🇷🇸" },
    { code: "SC", name: "Seychelles", flag: "🇸🇨" },
    { code: "SL", name: "Sierra Leone", flag: "🇸🇱" },
    { code: "SG", name: "Singapore", flag: "🇸🇬" },
    { code: "SK", name: "Slovakia", flag: "🇸🇰" },
    { code: "SI", name: "Slovenia", flag: "🇸🇮" },
    { code: "SB", name: "Solomon Islands", flag: "🇸🇧" },
    { code: "SO", name: "Somalia", flag: "🇸🇴" },
    { code: "ZA", name: "South Africa", flag: "🇿🇦" },
    { code: "SS", name: "South Sudan", flag: "🇸🇸" },
    { code: "ES", name: "Spain", flag: "🇪🇸" },
    { code: "LK", name: "Sri Lanka", flag: "🇱🇰" },
    { code: "SD", name: "Sudan", flag: "🇸🇩" },
    { code: "SR", name: "Suriname", flag: "🇸🇷" },
    { code: "SE", name: "Sweden", flag: "🇸🇪" },
    { code: "CH", name: "Switzerland", flag: "🇨🇭" },
    { code: "SY", name: "Syria", flag: "🇸🇾" },
    { code: "TW", name: "Taiwan", flag: "🇹🇼" },
    { code: "TJ", name: "Tajikistan", flag: "🇹🇯" },
    { code: "TZ", name: "Tanzania", flag: "🇹🇿" },
    { code: "TH", name: "Thailand", flag: "🇹🇭" },
    { code: "TL", name: "Timor-Leste", flag: "🇹🇱" },
    { code: "TG", name: "Togo", flag: "🇹🇬" },
    { code: "TO", name: "Tonga", flag: "🇹🇴" },
    { code: "TT", name: "Trinidad and Tobago", flag: "🇹🇹" },
    { code: "TN", name: "Tunisia", flag: "🇹🇳" },
    { code: "TR", name: "Turkey", flag: "🇹🇷" },
    { code: "TM", name: "Turkmenistan", flag: "🇹🇲" },
    { code: "TV", name: "Tuvalu", flag: "🇹🇻" },
    { code: "UG", name: "Uganda", flag: "🇺🇬" },
    { code: "UA", name: "Ukraine", flag: "🇺🇦" },
    { code: "AE", name: "United Arab Emirates", flag: "🇦🇪" },
    { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
    { code: "US", name: "United States", flag: "🇺🇸" },
    { code: "UY", name: "Uruguay", flag: "🇺🇾" },
    { code: "UZ", name: "Uzbekistan", flag: "🇺🇿" },
    { code: "VU", name: "Vanuatu", flag: "🇻🇺" },
    { code: "VE", name: "Venezuela", flag: "🇻🇪" },
    { code: "VN", name: "Vietnam", flag: "🇻🇳" },
    { code: "YE", name: "Yemen", flag: "🇾🇪" },
    { code: "ZM", name: "Zambia", flag: "🇿🇲" },
    { code: "ZW", name: "Zimbabwe", flag: "🇿🇼" },
    { code: "OTHER", name: "Other", flag: "🌍" },
];

export default function NewTournamentPublic() {
    const actionData = useActionData();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    const [selectedType, setSelectedType] = useState("americano");
    const [players, setPlayers] = useState([]);
    const [playerName, setPlayerName] = useState("");
    const [courts, setCourts] = useState(2);
    const [pointsPerMatch, setPointsPerMatch] = useState(24);
    const [customPoints, setCustomPoints] = useState(99);
    const [deuceMethod, setDeuceMethod] = useState("deuce");
    const [isPublic, setIsPublic] = useState(true);
    const [courtNames, setCourtNames] = useState(["Court 1", "Court 2"]);
    const [country, setCountry] = useState("NL");
    const [logoDataUrl, setLogoDataUrl] = useState("");

    const handleLogoChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setLogoDataUrl(ev.target.result);
        reader.readAsDataURL(file);
    };

    const minPlayers = getMinimumPlayers(selectedType);
    const playersForSubmission = selectedType === "team_americano" || selectedType === "team_mexicano"
        ? players.map((player, index) => ({ ...player, teamId: `team-${Math.floor(index / 2) + 1}` }))
        : players;
    const stats = getTournamentStats({
        type: selectedType,
        players: playersForSubmission,
        courtsAvailable: courts,
        pointsPerMatch,
    });
    const pointsOptions = POINTS_PRESETS[selectedType] || [16, 24, 32];
    const capacityInfo = getFormatCapacityInfo(selectedType, players.length, courts);
    const teams = selectedType === "team_americano" || selectedType === "team_mexicano" ? buildTeams(playersForSubmission) : [];

    const handleCourtsChange = (n) => {
        setCourts(n);
        setCourtNames(Array.from({ length: n }, (_, i) => courtNames[i] || `Court ${i + 1}`));
    };

    const handleTypeChange = (type) => {
        setSelectedType(type);
        const presets = POINTS_PRESETS[type];
        setPointsPerMatch(presets[0] || 24);
    };

    const addPlayer = () => {
        const trimmed = playerName.trim();
        if (!trimmed || players.find((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return;
        setPlayers([...players, { name: trimmed, gender: "unspecified" }]);
        setPlayerName("");
    };

    const removePlayer = (name) => setPlayers(players.filter((p) => p.name !== name));
    const handleKeyDown = (e) => { if (e.key === "Enter") { e.preventDefault(); addPlayer(); } };

    const sectionLabel = (text) => (
        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, marginTop: 8, fontWeight: 600, paddingLeft: 4 }}>
            {text}
        </div>
    );

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

            {/* Hero */}
            <div style={{
                height: 160,
                backgroundImage: "url(/hero-court.png)",
                backgroundSize: "cover",
                backgroundPosition: "center 35%",
                position: "relative",
            }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(28,79,53,0.3) 0%, rgba(0,0,0,0.6) 100%)" }} />
                <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontSize: "2rem", fontWeight: 400, color: "white", letterSpacing: "0.02em", textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}>
                        New Tournament
                    </div>
                </div>
            </div>

            <div className="ios-page">
                <Form method="post" encType="multipart/form-data">
                    {actionData?.error && (
                        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "var(--r-cell)", padding: "12px 16px", marginBottom: 20, color: "#991b1b", fontSize: "0.88rem" }}>
                            {actionData.error}
                        </div>
                    )}

                    {/* ── Event Name + Logo ── */}
                    {sectionLabel("Event")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "20px", marginBottom: 24, boxShadow: "var(--shadow)", display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ flexShrink: 0 }}>
                            <label style={{ cursor: "pointer", display: "block" }} title="Upload event logo">
                                <div style={{
                                    width: 72, height: 72, borderRadius: "var(--r-cell)",
                                    border: `2px dashed ${logoDataUrl ? "var(--green)" : "var(--sep-opaque)"}`,
                                    background: logoDataUrl ? "transparent" : "var(--bg-fill-2)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    overflow: "hidden", transition: "border-color 0.2s",
                                }}>
                                    {logoDataUrl
                                        ? <img src={logoDataUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        : <div style={{ textAlign: "center" }}>
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--label-3)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                                            <div style={{ fontSize: "0.58rem", color: "var(--label-3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Logo</div>
                                        </div>
                                    }
                                </div>
                                <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} />
                            </label>
                            {logoDataUrl && (
                                <button type="button" onClick={() => setLogoDataUrl("")} style={{ display: "block", width: "100%", marginTop: 4, background: "none", border: "none", color: "var(--label-3)", fontSize: "0.62rem", cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>Remove</button>
                            )}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Event Name</div>
                            <input
                                name="name"
                                placeholder="e.g. NOPA Summer Open"
                                required
                                style={{
                                    width: "100%",
                                    fontSize: "1.25rem",
                                    fontWeight: 600,
                                    fontFamily: "'Cormorant Garamond', serif",
                                    letterSpacing: "0.02em",
                                    border: "none",
                                    borderBottom: "2px solid var(--green)",
                                    borderRadius: 0,
                                    background: "transparent",
                                    padding: "6px 0",
                                    color: "var(--green)",
                                    outline: "none",
                                }}
                            />
                        </div>
                        <input type="hidden" name="logoUrl" value={logoDataUrl} />
                    </div>

                    {/* ── Event Info ── */}
                    {sectionLabel("Location")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Venue</div>
                            <input
                                name="location"
                                placeholder="Club Padel Amsterdam"
                                required
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
                            />
                        </div>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Country</div>
                            <select
                                value={country}
                                onChange={(e) => setCountry(e.target.value)}
                                name="country"
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none", cursor: "pointer" }}
                            >
                                {COUNTRIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* ── Visibility ── */}
                    {sectionLabel("Visibility")}
                    <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                        {[{ val: true, label: "Public", desc: "Listed on The Clubhouse" }, { val: false, label: "Private", desc: "Only via link/code" }].map(opt => (
                            <label key={String(opt.val)} style={{
                                display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flex: 1,
                                padding: "14px 16px", borderRadius: "var(--r-card)",
                                border: `2px solid ${isPublic === opt.val ? "var(--green)" : "var(--sep-opaque)"}`,
                                background: isPublic === opt.val ? "rgba(28,79,53,0.06)" : "var(--bg-card)",
                                transition: "all 0.15s", boxShadow: "var(--shadow)",
                            }}>
                                <input
                                    type="radio"
                                    name="isPublicRadio"
                                    value={String(opt.val)}
                                    checked={isPublic === opt.val}
                                    onChange={() => setIsPublic(opt.val)}
                                    style={{ accentColor: "var(--green)", width: 16, height: 16, flexShrink: 0 }}
                                />
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: isPublic === opt.val ? "var(--green)" : "var(--label)" }}>{opt.label}</div>
                                    <div style={{ fontSize: "0.72rem", color: "var(--label-3)", marginTop: 1 }}>{opt.desc}</div>
                                </div>
                            </label>
                        ))}
                        <input type="hidden" name="isPublic" value={String(isPublic)} />
                    </div>

                    {/* ── Game Type ── */}
                    {sectionLabel("Game Type")}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 24 }}>
                        {PLAY_TYPES.map((pt) => (
                            <button
                                key={pt.id}
                                type="button"
                                onClick={() => handleTypeChange(pt.id)}
                                style={{
                                    border: selectedType === pt.id ? "1.5px solid var(--green)" : "1px solid var(--sep)",
                                    borderRadius: "22px",
                                    background: selectedType === pt.id ? "rgba(28,79,53,0.05)" : "var(--bg-card)",
                                    boxShadow: selectedType === pt.id ? "0 14px 24px rgba(28,79,53,0.12)" : "0 8px 18px rgba(15,23,42,0.06)",
                                    padding: "10px 8px 9px",
                                    cursor: "pointer",
                                    textAlign: "center",
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
                                    style={{
                                        width: "min(100%, 68px)",
                                        aspectRatio: "1 / 1",
                                        objectFit: "contain",
                                        display: "block",
                                        filter: selectedType === pt.id ? "drop-shadow(0 8px 14px rgba(10,23,18,0.18))" : "drop-shadow(0 5px 9px rgba(10,23,18,0.12))",
                                    }}
                                />
                                <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                                    <div style={{ fontWeight: 600, fontSize: "0.76rem", color: selectedType === pt.id ? "var(--green)" : "var(--label)", lineHeight: 1.15 }}>{pt.name}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                    <input type="hidden" name="type" value={selectedType} />

                    {/* ── Match Settings ── */}
                    {sectionLabel("Match Settings")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>Points per Match</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <div style={{ fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", fontWeight: 600, paddingLeft: 4 }}>
                                        Standard
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {pointsOptions.map(p => (
                                    <button key={p} type="button" onClick={() => setPointsPerMatch(p)}
                                        style={{
                                            width: 58, height: 44, borderRadius: "var(--r-cell)",
                                            border: `2px solid ${pointsPerMatch === p ? "var(--green)" : "var(--sep-opaque)"}`,
                                            background: pointsPerMatch === p ? "var(--green)" : "var(--bg-grouped)",
                                            color: pointsPerMatch === p ? "white" : "var(--label-2)",
                                            fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
                                            transition: "all 0.15s", fontFamily: "inherit",
                                        }}
                                    >{p}</button>
                                ))}
                                    </div>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <div style={{ fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", fontWeight: 600, paddingLeft: 4 }}>
                                        Custom
                                    </div>
                                    <input
                                        type="number" min="1" max="999" value={customPoints}
                                        onChange={(e) => {
                                            const value = parseInt(e.target.value, 10) || 1;
                                            setCustomPoints(value);
                                            setPointsPerMatch(value);
                                        }}
                                        style={{
                                            width: 72, padding: "8px 10px", border: `2px solid ${!pointsOptions.includes(pointsPerMatch) ? "#dc2626" : "var(--sep-opaque)"}`,
                                            borderRadius: "var(--r-cell)", fontSize: "0.95rem", fontWeight: 700,
                                            textAlign: "center", fontFamily: "inherit", background: "var(--bg-grouped)",
                                            color: !pointsOptions.includes(pointsPerMatch) ? "#b91c1c" : "var(--label)",
                                        }}
                                        title="Custom"
                                    />
                                </div>
                            </div>
                            {!pointsOptions.includes(pointsPerMatch) && (
                                <div style={{ marginTop: 10, fontSize: "0.75rem", color: "#b91c1c", fontWeight: 600 }}>
                                    *Custom not recommended can result in non conclusive score
                                </div>
                            )}
                            <input type="hidden" name="pointsPerMatch" value={pointsPerMatch} />
                        </div>

                        <div style={{ padding: "16px" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>40:40 Method</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {DEUCE_METHODS.map(d => (
                                    <button key={d.id} type="button" onClick={() => setDeuceMethod(d.id)}
                                        style={{
                                            padding: "9px 16px", borderRadius: "var(--r-pill)",
                                            border: `2px solid ${deuceMethod === d.id ? "var(--green)" : "var(--sep-opaque)"}`,
                                            background: deuceMethod === d.id ? "var(--green)" : "var(--bg-grouped)",
                                            color: deuceMethod === d.id ? "white" : "var(--label-2)",
                                            fontWeight: 500, fontSize: "0.85rem", cursor: "pointer",
                                            transition: "all 0.15s", fontFamily: "inherit",
                                        }}
                                    >{d.label}</button>
                                ))}
                            </div>
                            <input type="hidden" name="deuceMethod" value={deuceMethod} />
                        </div>
                    </div>

                    {/* ── Courts ── */}
                    {sectionLabel("Courts")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>Number of Courts</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                    <button key={n} type="button" onClick={() => handleCourtsChange(n)}
                                        style={{
                                            width: 48, height: 48, borderRadius: "var(--r-cell)",
                                            border: `2px solid ${courts === n ? "var(--green)" : "var(--sep-opaque)"}`,
                                            background: courts === n ? "var(--green)" : "var(--bg-grouped)",
                                            color: courts === n ? "white" : "var(--label-2)",
                                            fontWeight: 700, fontSize: "1rem", cursor: "pointer",
                                            transition: "all 0.15s", fontFamily: "inherit",
                                        }}
                                    >{n}</button>
                                ))}
                            </div>
                        </div>

                        <div style={{ padding: "16px" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>Court Names</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                                {courtNames.map((name, i) => (
                                    <input
                                        key={i}
                                        value={name}
                                        onChange={(e) => {
                                            const updated = [...courtNames];
                                            updated[i] = e.target.value;
                                            setCourtNames(updated);
                                        }}
                                        placeholder={`Court ${i + 1}`}
                                        style={{
                                            textAlign: "center", padding: "10px 12px",
                                            border: "1.5px solid var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                            background: "var(--bg-grouped)", fontSize: "0.88rem", fontFamily: "inherit",
                                            color: "var(--label)", outline: "none",
                                        }}
                                        onFocus={e => e.target.style.borderColor = "var(--green)"}
                                        onBlur={e => e.target.style.borderColor = "var(--sep-opaque)"}
                                    />
                                ))}
                            </div>
                            <input type="hidden" name="courts" value={courts} />
                            <input type="hidden" name="courtNames" value={JSON.stringify(courtNames)} />
                        </div>
                    </div>

                    {/* ── Players ── */}
                    {sectionLabel("Players")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: players.length > 0 ? "1px solid var(--sep)" : "none" }}>
                            <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--label)" }}>{players.length} players</span>
                            <span style={{ fontSize: "0.78rem", color: "var(--label-3)" }}>
                                {selectedType === "team_americano" || selectedType === "team_mexicano"
                                    ? <>Teams: <strong style={{ color: "var(--green)" }}>{teams.length}</strong></>
                                    : <>Full setup: <strong style={{ color: "var(--green)" }}>{courts * 4}</strong></>}
                            </span>
                        </div>

                        {players.map((p, i) => (
                            <div key={p.name} style={{
                                display: "flex", alignItems: "center", padding: "13px 16px",
                                borderBottom: "1px solid var(--sep)", gap: 12,
                            }}>
                                <span style={{ width: 22, fontWeight: 700, color: "var(--green)", fontSize: "0.82rem", flexShrink: 0 }}>{i + 1}</span>
                                <span style={{ flex: 1, fontWeight: 500, fontSize: "0.92rem", color: "var(--label)" }}>{p.name}</span>
                                {(selectedType === "team_americano" || selectedType === "team_mexicano") && (
                                    <span style={{ fontSize: "0.74rem", color: "var(--green)", fontWeight: 700 }}>
                                        Team {Math.floor(i / 2) + 1}
                                    </span>
                                )}
                                <button type="button" onClick={() => removePlayer(p.name)} style={{
                                    background: "var(--bg-fill)", border: "none", color: "var(--label-3)",
                                    cursor: "pointer", fontSize: "0.9rem", width: 26, height: 26,
                                    borderRadius: "50%", lineHeight: 1, fontFamily: "inherit",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>×</button>
                            </div>
                        ))}

                        <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
                            <input
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Player name..."
                                style={{
                                    flex: 1, padding: "10px 12px", border: "1.5px solid var(--sep-opaque)",
                                    borderRadius: "var(--r-cell)", fontSize: "0.9rem", fontFamily: "inherit",
                                    color: "var(--label)", background: "var(--bg-grouped)", outline: "none",
                                }}
                                onFocus={e => e.target.style.borderColor = "var(--green)"}
                                onBlur={e => e.target.style.borderColor = "var(--sep-opaque)"}
                            />
                            <button type="button" onClick={addPlayer} style={{
                                padding: "10px 18px", borderRadius: "var(--r-cell)",
                                background: "var(--green)", color: "white",
                                fontWeight: 600, fontSize: "0.88rem", border: "none",
                                cursor: "pointer", fontFamily: "inherit",
                            }}>Add</button>
                        </div>
                        <input type="hidden" name="players" value={JSON.stringify(playersForSubmission)} />
                    </div>

                    {/* ── Stats Preview ── */}
                    {stats && (
                        <div style={{
                            background: "linear-gradient(135deg, var(--green-dark), var(--green))",
                            color: "white", borderRadius: "var(--r-card)", padding: "20px 24px", marginBottom: 24,
                            boxShadow: "0 4px 20px rgba(28,79,53,0.3)",
                        }}>
                            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.65, marginBottom: 14, fontWeight: 600 }}>Tournament Preview</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, textAlign: "center" }}>
                                {[
                                    { label: "Matches", value: stats.totalMatches },
                                    { label: "Duration", value: stats.duration },
                                    { label: stats.formatKind === "team" ? "Per Team" : "Per Player", value: stats.matchesPerEntry },
                                ].map(s => (
                                    <div key={s.label}>
                                        <div style={{ fontSize: "1.7rem", fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
                                        <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.65, marginTop: 4 }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {capacityInfo.warning && (
                        <div style={{
                            background: "#fff7ed",
                            border: "1px solid #fdba74",
                            borderRadius: "var(--r-card)",
                            padding: "14px 16px",
                            marginBottom: 24,
                            color: "#9a3412",
                            fontSize: "0.85rem",
                            lineHeight: 1.45,
                        }}>
                            {capacityInfo.warning}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={players.length < minPlayers || isSubmitting}
                        style={{
                            width: "100%", padding: "16px", borderRadius: "var(--r-card)",
                            background: players.length >= minPlayers ? "var(--green)" : "var(--sep-opaque)",
                            color: "white", fontWeight: 600, fontSize: "1rem",
                            border: "none", cursor: players.length >= minPlayers ? "pointer" : "not-allowed",
                            fontFamily: "inherit", transition: "background 0.2s",
                            boxShadow: players.length >= minPlayers ? "0 4px 16px rgba(28,79,53,0.3)" : "none",
                        }}
                    >
                        {isSubmitting
                            ? "Creating..."
                            : players.length < minPlayers
                                ? `Need ${minPlayers - players.length} more to start · ${courts * 4} for full setup`
                                : `Create Tournament · ${players.length} players`}
                    </button>
                </Form>
            </div>
        </>
    );
}
