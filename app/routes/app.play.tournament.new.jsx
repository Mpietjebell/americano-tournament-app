import { json, redirect } from "@remix-run/node";
import { useActionData, useNavigation, Form, Link } from "@remix-run/react";
import { useState, useEffect } from "react";
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

// Builds a Date from a "YYYY-MM-DD" + hour/minute, returning null instead of
// an Invalid Date when the pieces don't form a real date (e.g. a malformed
// value typed into the native date input).
function parseScheduledDateTime(dateStr, hour, minute) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    return Number.isNaN(d.getTime()) ? null : d;
}

export const meta = () => [
    { title: "New Tournament — NOPA" },
    { name: "description", content: "Organise an Americano, Mexicano, or padel tournament in minutes with NOPA." },
];

export const action = async ({ request }) => {
    const userId = getUserIdFromCookie(request);
    const formData = await request.formData();
    const name = formData.get("name");
    const location = formData.get("location");
    const country = formData.get("country") || "";
    const logoUrl = formData.get("logoUrl") || null;
    const type = formData.get("type");
    const courts = parseInt(formData.get("courts"), 10) || 2;
    const pointsPerMatch = parseInt(formData.get("pointsPerMatch"), 10) || 21;
    const deuceMethod = formData.get("deuceMethod") || "deuce";
    const googleMapsUrl = formData.get("googleMapsUrl") || null;
    const price = formData.get("price") ? parseFloat(formData.get("price")) : null;
    const currency = formData.get("currency") || "EUR";
    const city = formData.get("city") || null;
    const isPublic = formData.get("isPublic") !== "false";
    const courtNamesRaw = formData.get("courtNames");
    const venueId = formData.get("venueId") || null;
    const scheduledAtStr = formData.get("scheduledAt") || null;
    const maxPlayersRaw = formData.get("maxPlayers");
    const maxPlayers = maxPlayersRaw ? parseInt(maxPlayersRaw, 10) || null : null;
    const maxStandbyRaw = formData.get("maxStandby");
    const maxStandby = maxStandbyRaw ? parseInt(maxStandbyRaw, 10) || null : null;
    const duration = formData.get("duration") ? parseInt(formData.get("duration"), 10) : null;
    const repeatWeeks = formData.get("repeatWeeks") ? parseInt(formData.get("repeatWeeks"), 10) : 0;
    const organizerName = formData.get("organizerName") || null;
    const hostPassword = formData.get("hostPassword") || null;
    const hostEmail = formData.get("hostEmail") || null;
    const level = formData.get("level") ? parseInt(formData.get("level"), 10) : null;
    const description = formData.get("description") || null;
    const latitude = formData.get("latitude") ? parseFloat(formData.get("latitude")) : null;
    const longitude = formData.get("longitude") ? parseFloat(formData.get("longitude")) : null;
    const isScheduled = !!scheduledAtStr;

    if (!name || !location || !type) {
        return json({ error: "Please fill in all required fields." }, { status: 400 });
    }
    if (isScheduled && !duration) {
        return json({ error: "Please set an estimated duration for the tournament." }, { status: 400 });
    }
    if (isPublic && !googleMapsUrl) {
        return json({ error: "A Google Maps URL is required for public tournaments." }, { status: 400 });
    }
    if (isPublic && !maxPlayers) {
        return json({ error: "Max players is required for public tournaments." }, { status: 400 });
    }
    if (isPublic && !hostPassword) {
        return json({ error: "A host password is required for public tournaments." }, { status: 400 });
    }

    let playerNames = [];
    const slotCount = parseInt(formData.get("slotCount") || "0", 10);
    for (let i = 0; i < slotCount; i++) {
        const name = (formData.get(`playerSlot_${i}`) || "").toString().trim();
        if (name) playerNames.push({ name, gender: "unspecified" });
    }

    if (!isScheduled) {
        const minPlayers = getMinimumPlayers(type);
        if (playerNames.length < minPlayers) {
            return json({ error: `You need at least ${minPlayers} players to start this tournament.` }, { status: 400 });
        }
        if ((type === "team_americano" || type === "team_mexicano") && playerNames.length % 2 !== 0) {
            return json({ error: "Fixed-team formats need an even number of players." }, { status: 400 });
        }
    }

    let courtNames = null;
    try { if (courtNamesRaw) courtNames = JSON.stringify(JSON.parse(courtNamesRaw)); } catch { /* ignore */ }

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
            city,
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
            scheduledAt: scheduledAtStr ? new Date(scheduledAtStr) : null,
            maxPlayers: maxPlayers || null,
            maxStandby: maxStandby || null,
            venueId: venueId || null,
            latitude: latitude || null,
            longitude: longitude || null,
            googleMapsUrl: googleMapsUrl || null,
            duration: duration || null,
            price: price || null,
            currency: currency || "EUR",
            organizerName: organizerName || null,
            hostPassword: hostPassword || null,
            hostEmail: hostEmail || null,
            level: level || null,
            description: description || null,
            players: {
                create: playerNames.map((p, index) => ({
                    name: p.name,
                    gender: p.gender || "unspecified",
                    teamId: p.teamId || (type === "team_americano" || type === "team_mexicano" ? `team-${Math.floor(index / 2) + 1}` : null),
                })),
            },
        },
    });

    // Create additional weekly copies if requested
    if (repeatWeeks > 0 && scheduledAtStr) {
        const baseDate = new Date(scheduledAtStr);
        for (let w = 1; w <= repeatWeeks; w++) {
            const weeklyDate = new Date(baseDate.getTime() + w * 7 * 24 * 60 * 60 * 1000);
            let weeklyCode;
            let wAttempts = 0;
            do {
                weeklyCode = generateJoinCode();
                const existing = await prisma.tournament.findUnique({ where: { joinCode: weeklyCode } });
                if (!existing) break;
                wAttempts++;
            } while (wAttempts < 10);
            await prisma.tournament.create({
                data: {
                    name, location, country, city, logoUrl, type,
                    courtsAvailable: courts, pointsPerMatch, deuceMethod,
                    isPublic, joinCode: weeklyCode, courtNames,
                    isGuest: !userId, createdById: userId || null,
                    scheduledAt: weeklyDate,
                    maxPlayers: maxPlayers || null, maxStandby: maxStandby || null,
                    venueId: venueId || null, latitude: latitude || null, longitude: longitude || null,
                    googleMapsUrl: googleMapsUrl || null, duration: duration || null,
                    price: price || null, currency: currency || "EUR",
                    organizerName: organizerName || null,
                    hostPassword: hostPassword || null, hostEmail: hostEmail || null,
                    level: level || null, description: description || null,
                },
            });
        }
    }

    return redirect(`/app/play/tournament/${tournament.id}/overview`, {
        headers: {
            "Set-Cookie": createHostCookie(tournament.id, tournament.hostToken),
        },
    });
};

const PLAY_TYPES = [
    { id: "americano", name: "Americano", desc: "Rotating partners, individual points", info: "Each round you rotate partners and opponents. Points are individual — you collect your own score every match regardless of partner. At the end, the player with the most total points wins. Best format for mixed groups where everyone wants to play together." },
    { id: "mexicano", name: "Mexicano", desc: "Performance-based Swiss System", info: "After each round, players are ranked by total points and matched so the top two play each other, bottom two play each other, etc. Partners also rotate based on ranking. Gets more competitive as the tournament progresses — similar skill levels always face each other." },
    { id: "team_americano", name: "Team Americano", desc: "Fixed partners, rotating opponents", info: "You keep the same partner throughout the tournament but rotate opponents every round. Points are counted per team. Great when you want to play with a specific friend but still compete against every other pair." },
    { id: "team_mexicano", name: "Team Mexicano", desc: "Fixed partners, ranking-based courts", info: "Fixed teams like Team Americano, but after each round the top teams move to the feature court and lower teams drop down — similar to a Swiss ladder. Keeps games competitive throughout." },
    { id: "king_of_the_court", name: "King of the Court", desc: "Winners move up, losers move down", info: "Courts are ranked 1 (best) to N. Winners move up a court, losers move down. The goal is to reach and stay on Court 1. Partners rotate every round. High energy format — great for clubs where players arrive at different skill levels." },
    { id: "beat_the_box", name: "Beat the Box", desc: "King of the Court, winner stays", info: "A variation of King of the Court where the winning team stays on the court and the losing team rotates out. Challengers queue up to take on the reigning pair. Fast-paced and spectator-friendly." },
];

const DEUCE_METHODS = [
    { id: "deuce", label: "Deuce" },
    { id: "golden_point", label: "Golden Point" },
    { id: "starpoint", label: "Starpoint" },
    { id: "tie_break", label: "Tie Break" },
];

const POINTS_PRESETS = {
    americano: [16, 21, 32],
    mexicano: [16, 21, 32],
    team_americano: [16, 21, 32],
    team_mexicano: [16, 21, 32],
    king_of_the_court: [16, 21, 32],
    beat_the_box: [16, 21, 32],
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
    const [courts, setCourts] = useState(2);
    const [playerSlots, setPlayerSlots] = useState(() => Array(2 * 4).fill(""));
    const [pointsPerMatch, setPointsPerMatch] = useState(21);
    const [customPoints, setCustomPoints] = useState(99);
    const [googleMapsUrl, setGoogleMapsUrl] = useState("");
    const [mapsLoading, setMapsLoading] = useState(false);
    const [mapsResult, setMapsResult] = useState(null);
    const [mapsError, setMapsError] = useState(null);
    const [price, setPrice] = useState("");
    const [currency, setCurrency] = useState("EUR");
    const [city, setCity] = useState("");
    const [locationOverride, setLocationOverride] = useState("");
    const [infoModal, setInfoModal] = useState(null);
    const [deuceMethod, setDeuceMethod] = useState("golden_point");
    const [isPublic, setIsPublic] = useState(true);
    const [courtNames, setCourtNames] = useState(["Court 1", "Court 2"]);
    const [country, setCountry] = useState("NL");
    const [logoDataUrl, setLogoDataUrl] = useState("");
    const [lat, setLat] = useState("");
    const [lng, setLng] = useState("");

    // Venue autocomplete
    const [venueQuery, setVenueQuery] = useState("");
    const [venuePredictions, setVenuePredictions] = useState([]);
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [venueLoading, setVenueLoading] = useState(false);
    const venueDebounce = useState(null);

    // Schedule
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledDate, setScheduledDate] = useState("");
    const [scheduledHour, setScheduledHour] = useState(18);
    const [scheduledMinute, setScheduledMinute] = useState(0);
    const [maxPlayers, setMaxPlayers] = useState(courts * 4);
    const [maxStandby, setMaxStandby] = useState(Math.ceil(courts * 4 * 0.1));
    const [showDateWarning, setShowDateWarning] = useState(false);
    const [dateWarningAcknowledged, setDateWarningAcknowledged] = useState(false);
    const [pendingDate, setPendingDate] = useState("");
    const [duration, setDuration] = useState(90);
    // Set only after mount so the date input's `min` never depends on the
    // render-time clock (avoids a server/client hydration mismatch).
    const [minDate, setMinDate] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});

    // Level + description
    const [level, setLevel] = useState(null);
    const [description, setDescription] = useState("");

    // Repeat weekly
    const [repeatWeekly, setRepeatWeekly] = useState(false);
    const [repeatWeeklyInput, setRepeatWeeklyInput] = useState("");
    const [repeatWeeklyConfirmed, setRepeatWeeklyConfirmed] = useState(false);
    const [repeatWeeks, setRepeatWeeks] = useState(4);

    // Organiser
    const [organizerName, setOrganizerName] = useState("");
    const [hostPassword, setHostPassword] = useState("");
    const [hostEmail, setHostEmail] = useState("");

    // Combined datetime for form submission — only ever a value the server
    // can parse. A malformed scheduledDate collapses to "" instead of
    // silently shipping an unparseable string.
    const scheduledDateTime = parseScheduledDateTime(scheduledDate, scheduledHour, scheduledMinute);
    const scheduledAt = scheduledDateTime
        ? `${scheduledDate}T${String(scheduledHour).padStart(2, "0")}:${String(scheduledMinute).padStart(2, "0")}`
        : "";
    const scheduledDateInvalid = Boolean(scheduledDate) && !scheduledDateTime;

    const handleMapsUrlBlur = async () => {
        const url = googleMapsUrl.trim();
        if (!url) return;
        setMapsLoading(true);
        setMapsError(null);
        setMapsResult(null);
        try {
            const res = await fetch(`/api/maps/parse?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (data.ok) {
                setMapsResult(data);
                if (data.venueName) {
                    setVenueQuery(data.venueName);
                    setLocationOverride(data.venueName);
                }
                if (data.city) setCity(data.city);
                if (data.country) setCountry(data.country);
                if (data.currency) setCurrency(data.currency);
                if (data.lat) setLat(String(data.lat));
                if (data.lng) setLng(String(data.lng));
            } else {
                setMapsError(data.error || "Could not detect location");
            }
        } catch {
            setMapsError("Network error — fill in manually");
        } finally {
            setMapsLoading(false);
        }
    };

    const handleScheduledDateChange = (val) => {
        if (!val) { setScheduledDate(""); return; }
        if (!dateWarningAcknowledged) {
            setPendingDate(val);
            setShowDateWarning(true);
        } else {
            setScheduledDate(val);
        }
    };

    const confirmDateWarning = () => {
        setShowDateWarning(false);
        setDateWarningAcknowledged(true);
        setScheduledDate(pendingDate);
        setPendingDate("");
    };

    const fmtScheduledDisplay = () => {
        if (!scheduledDateTime) return null;
        return scheduledDateTime.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
            + " · " + scheduledDateTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    };

    const handleLogoChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setLogoDataUrl(ev.target.result);
        reader.readAsDataURL(file);
    };

    const handleVenueInput = (e) => {
        const q = e.target.value;
        setVenueQuery(q);
        setSelectedVenue(null);
        if (venueDebounce[0]) clearTimeout(venueDebounce[0]);
        if (q.length < 2) { setVenuePredictions([]); return; }
        venueDebounce[0] = setTimeout(async () => {
            setVenueLoading(true);
            try {
                const res = await fetch(`/api/venues/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                setVenuePredictions(data.predictions || []);
            } catch { setVenuePredictions([]); }
            finally { setVenueLoading(false); }
        }, 350);
    };

    const handleVenueSelect = async (prediction) => {
        setVenueQuery(prediction.mainText || prediction.description);
        setVenuePredictions([]);
        setVenueLoading(true);
        try {
            const res = await fetch("/api/venues/select", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    osmId: prediction.osmId,
                    name: prediction.name,
                    address: prediction.address,
                    city: prediction.city,
                    country: prediction.country,
                    latitude: prediction.latitude,
                    longitude: prediction.longitude,
                }),
            });
            const data = await res.json();
            if (data.venue) {
                setSelectedVenue(data.venue);
                setCountry(data.venue.country || country);
                if (data.venue.city) setCity(data.venue.city);
                if (data.venue.latitude) setLat(String(data.venue.latitude));
                if (data.venue.longitude) setLng(String(data.venue.longitude));
                setLocationOverride(data.venue.name || "");
            }
        } catch { /* silent */ }
        finally { setVenueLoading(false); }
    };

    useEffect(() => {
        const count = courts * 4;
        setPlayerSlots(prev => {
            const next = Array(count).fill("");
            prev.forEach((val, i) => { if (i < count) next[i] = val; });
            return next;
        });
    }, [courts]);

    useEffect(() => {
        setMaxStandby(Math.ceil(maxPlayers * 0.1));
    }, [maxPlayers]);

    useEffect(() => {
        setMinDate(new Date(Date.now() + 3600000).toISOString().slice(0, 10));
    }, []);

    const minPlayers = getMinimumPlayers(selectedType);
    const playersForSubmission = playerSlots
        .filter(s => s.trim())
        .map((name, index) => ({
            name: name.trim(),
            gender: "unspecified",
            teamId: (selectedType === "team_americano" || selectedType === "team_mexicano") ? `team-${Math.floor(index / 2) + 1}` : null,
        }));
    const stats = getTournamentStats({
        type: selectedType,
        players: playersForSubmission,
        courtsAvailable: courts,
        pointsPerMatch,
    });
    const pointsOptions = POINTS_PRESETS[selectedType] || [16, 24, 32];
    const capacityInfo = getFormatCapacityInfo(selectedType, playersForSubmission.length, courts);

    const handleCourtsChange = (n) => {
        setCourts(n);
        setCourtNames(Array.from({ length: n }, (_, i) => courtNames[i] || `Court ${i + 1}`));
    };

    const handleTypeChange = (type) => {
        setSelectedType(type);
        setPointsPerMatch(21);
    };

    const sectionLabel = (text) => (
        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--label-3)", marginBottom: 12, marginTop: 8, fontWeight: 600, paddingLeft: 4 }}>
            {text}
        </div>
    );

    // Explicit, visible validation for everything the server would otherwise
    // reject — a required field that fails silently (no message, no request)
    // is worse than one caught here with a clear reason. Runs instead of
    // native browser validation (the <Form> below has noValidate) so the
    // message always shows, even for fields the browser might not flag.
    const handleSubmit = (e) => {
        const form = e.currentTarget;
        const data = new FormData(form);
        const errors = {};

        if (!(data.get("name") || "").toString().trim()) {
            errors.name = "Give this event a name.";
        }

        if (isScheduled) {
            if (!scheduledDateTime) errors.scheduledDate = "Pick a valid date and time before scheduling.";
            if (!duration) errors.duration = "Choose an estimated duration.";
        }

        if (isPublic) {
            const gmaps = (data.get("googleMapsUrl") || "").toString().trim();
            const venueName = (data.get("location") || "").toString().trim();
            const cityVal = (data.get("city") || "").toString().trim();
            if (!gmaps && (!venueName || !cityVal)) {
                errors.venue = "Paste a Google Maps link, or fill in both Venue Name and City / District yourself.";
            }
            if (!maxPlayers) errors.maxPlayers = "Set a max players count for public tournaments.";
            if (!hostPassword.trim()) errors.hostPassword = "Set a host password so you can manage this tournament later.";
        }

        if (Object.keys(errors).length > 0) {
            e.preventDefault();
            setFieldErrors(errors);
            const firstKey = Object.keys(errors)[0];
            document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }

        setFieldErrors({});
    };

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
                <Form method="post" encType="multipart/form-data" noValidate onSubmit={handleSubmit}>
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
                        <div style={{ flex: 1 }} id="field-name">
                            <div style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Event Name</div>
                            <input
                                name="name"
                                placeholder="e.g. NOPA Summer Open"
                                autoComplete="off"
                                required
                                onChange={() => fieldErrors.name && setFieldErrors(prev => ({ ...prev, name: undefined }))}
                                style={{
                                    width: "100%",
                                    fontSize: "1.25rem",
                                    fontWeight: 600,
                                    fontFamily: "'Cormorant Garamond', serif",
                                    letterSpacing: "0.02em",
                                    border: "none",
                                    borderBottom: `2px solid ${fieldErrors.name ? "#dc2626" : "var(--green)"}`,
                                    borderRadius: 0,
                                    background: "transparent",
                                    padding: "6px 0",
                                    color: "var(--green)",
                                    outline: "none",
                                }}
                            />
                            {fieldErrors.name && (
                                <div style={{ fontSize: "0.74rem", color: "#dc2626", marginTop: 6 }}>{fieldErrors.name}</div>
                            )}
                        </div>
                        <input type="hidden" name="logoUrl" value={logoDataUrl} />
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

                    {/* ── Schedule ── */}
                    {sectionLabel("Schedule")}

                    {/* Date warning modal */}
                    {showDateWarning && (
                        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 env(safe-area-inset-bottom)" }}>
                            <div style={{ background: "var(--bg-card)", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480 }}>
                                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--sep-opaque)", margin: "0 auto 20px" }} />
                                <div style={{ fontSize: "1.5rem", marginBottom: 12, textAlign: "center" }}>📅</div>
                                <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--label)", marginBottom: 10, textAlign: "center" }}>Before you confirm this date</div>
                                <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "var(--r-cell)", padding: "14px 16px", marginBottom: 16 }}>
                                    <p style={{ fontSize: "0.88rem", color: "#92400e", lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
                                        ⚠️ Please make sure you have <strong>confirmed availability with the venue</strong> for this date and time.
                                    </p>
                                </div>
                                <div style={{ background: "var(--bg-fill-2)", borderRadius: "var(--r-cell)", padding: "12px 14px", marginBottom: 20 }}>
                                    <p style={{ fontSize: "0.82rem", color: "var(--label-3)", lineHeight: 1.6, margin: 0 }}>
                                        This system does <strong>not</strong> check for public holidays, national days, or local events that may affect venue availability.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={confirmDateWarning}
                                    style={{ width: "100%", padding: "14px", borderRadius: "var(--r-card)", background: "var(--green)", color: "white", border: "none", fontWeight: 600, fontSize: "0.95rem", cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}
                                >
                                    Yes, I've confirmed with the venue
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowDateWarning(false); setPendingDate(""); }}
                                    style={{ width: "100%", padding: "12px", borderRadius: "var(--r-card)", background: "transparent", color: "var(--label-3)", border: "1px solid var(--sep)", fontWeight: 500, fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit" }}
                                >
                                    Let me check first
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                        {/* Toggle */}
                        <div style={{ padding: "14px 16px", borderBottom: isScheduled ? "1px solid var(--sep)" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--label)" }}>Schedule for later</div>
                                <div style={{ fontSize: "0.72rem", color: "var(--label-3)", marginTop: 2 }}>Public sign-ups open until the event is full or it starts</div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={isScheduled}
                                aria-label="Schedule for later"
                                onClick={() => setIsScheduled(!isScheduled)}
                                style={{
                                    width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
                                    background: isScheduled ? "var(--green)" : "var(--sep-opaque)",
                                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                                }}
                            >
                                <span style={{
                                    position: "absolute", top: 3, left: isScheduled ? 21 : 3,
                                    width: 20, height: 20, borderRadius: "50%", background: "white",
                                    transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                                }} />
                            </button>
                        </div>

                        {isScheduled && (
                            <>
                                {/* ── Date ── */}
                                <div style={{ padding: "14px 16px", borderBottom: repeatWeekly ? "none" : "1px solid var(--sep)" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 600 }}>Date</div>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                            <input
                                                type="checkbox"
                                                checked={repeatWeekly}
                                                onChange={(e) => {
                                                    setRepeatWeekly(e.target.checked);
                                                    if (!e.target.checked) {
                                                        setRepeatWeeklyInput("");
                                                        setRepeatWeeklyConfirmed(false);
                                                    }
                                                }}
                                                style={{ accentColor: "var(--green)", width: 14, height: 14 }}
                                            />
                                            <span style={{ fontSize: "0.68rem", fontWeight: 600, color: repeatWeekly ? "var(--green)" : "var(--label-3)" }}>Repeat weekly</span>
                                        </label>
                                    </div>
                                    <input
                                        type="date"
                                        value={scheduledDate}
                                        onChange={(e) => handleScheduledDateChange(e.target.value)}
                                        required={isScheduled}
                                        min={minDate || undefined}
                                        style={{
                                            width: "100%", border: scheduledDateInvalid ? "1.5px solid #dc2626" : "none",
                                            borderRadius: scheduledDateInvalid ? "var(--r-cell)" : 0,
                                            padding: scheduledDateInvalid ? "6px 8px" : 0,
                                            background: "transparent", fontSize: "1rem", fontFamily: "inherit", color: "var(--label)", outline: "none", cursor: "pointer",
                                        }}
                                    />
                                    {scheduledDateInvalid && (
                                        <div style={{ fontSize: "0.74rem", color: "#dc2626", marginTop: 6 }}>
                                            That date doesn't look right — please pick it again using the calendar.
                                        </div>
                                    )}
                                </div>

                                {/* ── Repeat weekly panel ── */}
                                {repeatWeekly && (
                                    <div style={{ borderBottom: "1px solid var(--sep)", background: "#fffbeb", padding: "14px 16px" }}>
                                        <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                                            <div style={{ fontSize: "0.82rem", color: "#92400e", fontWeight: 600, marginBottom: 4 }}>⚠️ Check venue availability</div>
                                            <div style={{ fontSize: "0.75rem", color: "#92400e", lineHeight: 1.55 }}>Make sure you check availability with the venue to create this event weekly. Each week will create a new tournament with the same settings.</div>
                                        </div>
                                        {!repeatWeeklyConfirmed ? (
                                            <div>
                                                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Type WEEKLY to confirm</div>
                                                <input
                                                    type="text"
                                                    value={repeatWeeklyInput}
                                                    onChange={(e) => {
                                                        setRepeatWeeklyInput(e.target.value);
                                                        if (e.target.value === "WEEKLY") setRepeatWeeklyConfirmed(true);
                                                    }}
                                                    placeholder="WEEKLY"
                                                    style={{
                                                        width: "100%", boxSizing: "border-box", padding: "10px 12px",
                                                        border: `2px solid ${repeatWeeklyInput === "WEEKLY" ? "var(--green)" : "var(--sep-opaque)"}`,
                                                        borderRadius: 10, fontSize: "0.95rem", fontFamily: "inherit",
                                                        fontWeight: 700, letterSpacing: "0.06em", outline: "none",
                                                        background: "white", color: "var(--label)",
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--green)", marginBottom: 10 }}>✓ Confirmed — how many weeks?</div>
                                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                    {[2, 4, 6, 8, 12].map(w => (
                                                        <button key={w} type="button" onClick={() => setRepeatWeeks(w)}
                                                            style={{
                                                                width: 48, height: 38, borderRadius: 10,
                                                                border: `2px solid ${repeatWeeks === w ? "var(--green)" : "var(--sep-opaque)"}`,
                                                                background: repeatWeeks === w ? "var(--green)" : "white",
                                                                color: repeatWeeks === w ? "white" : "var(--label-2)",
                                                                fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
                                                                fontFamily: "inherit", transition: "all 0.15s",
                                                            }}
                                                        >{w}</button>
                                                    ))}
                                                    <input
                                                        type="number" min="1" max="52"
                                                        value={repeatWeeks}
                                                        onChange={(e) => setRepeatWeeks(Math.min(52, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                                                        style={{
                                                            width: 60, padding: "6px 8px",
                                                            border: "1.5px solid var(--sep-opaque)", borderRadius: 10,
                                                            fontSize: "0.9rem", fontWeight: 700, textAlign: "center",
                                                            fontFamily: "inherit", background: "white", color: "var(--label)",
                                                        }}
                                                    />
                                                    <span style={{ fontSize: "0.78rem", color: "var(--label-3)" }}>weeks</span>
                                                </div>
                                                <div style={{ marginTop: 8, fontSize: "0.72rem", color: "var(--label-3)" }}>
                                                    Creates {repeatWeeks} additional tournaments · same day each week
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <input type="hidden" name="repeatWeeks" value={repeatWeekly && repeatWeeklyConfirmed ? repeatWeeks : 0} />

                                {/* ── Time: hour picker ── */}
                                <div style={{ padding: "14px 0 0", borderBottom: "1px solid var(--sep)" }}>
                                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 10, fontWeight: 600, paddingLeft: 16 }}>
                                        Start Time
                                        {scheduledDate && (
                                            <span style={{ float: "right", paddingRight: 16, color: "var(--green)", textTransform: "none", letterSpacing: 0, fontWeight: 700, fontSize: "0.78rem" }}>
                                                {String(scheduledHour).padStart(2, "0")}:{String(scheduledMinute).padStart(2, "0")}
                                            </span>
                                        )}
                                    </div>
                                    {/* Hour scroll */}
                                    <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 12px", scrollbarWidth: "none" }}>
                                        {Array.from({ length: 18 }, (_, i) => i + 6).map(h => (
                                            <button
                                                key={h}
                                                type="button"
                                                onClick={() => setScheduledHour(h)}
                                                style={{
                                                    flexShrink: 0,
                                                    width: 52, height: 44,
                                                    borderRadius: "var(--r-cell)",
                                                    border: `2px solid ${scheduledHour === h ? "var(--green)" : "var(--sep-opaque)"}`,
                                                    background: scheduledHour === h ? "var(--green)" : "var(--bg-grouped)",
                                                    color: scheduledHour === h ? "white" : "var(--label-2)",
                                                    fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
                                                    fontFamily: "inherit", transition: "all 0.15s",
                                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0,
                                                }}
                                            >
                                                <span style={{ fontSize: "0.78rem", lineHeight: 1 }}>{h < 12 ? h : h === 12 ? 12 : h - 12}</span>
                                                <span style={{ fontSize: "0.5rem", opacity: 0.7, lineHeight: 1.4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h < 12 ? "AM" : "PM"}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {/* Minute selector */}
                                    <div style={{ display: "flex", gap: 8, padding: "0 16px 14px" }}>
                                        {[0, 15, 30, 45].map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setScheduledMinute(m)}
                                                style={{
                                                    flex: 1, height: 38,
                                                    borderRadius: "var(--r-cell)",
                                                    border: `2px solid ${scheduledMinute === m ? "var(--green)" : "var(--sep-opaque)"}`,
                                                    background: scheduledMinute === m ? "var(--green)" : "var(--bg-grouped)",
                                                    color: scheduledMinute === m ? "white" : "var(--label-2)",
                                                    fontWeight: 700, fontSize: "0.88rem", cursor: "pointer",
                                                    fontFamily: "inherit", transition: "all 0.15s",
                                                }}
                                            >
                                                :{String(m).padStart(2, "0")}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Duration — required */}
                                <div style={{ padding: "0 16px 14px", borderBottom: "1px solid var(--sep)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                                        <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 600 }}>
                                            Duration
                                        </div>
                                        <span style={{ fontSize: "0.58rem", background: "rgba(239,68,68,0.1)", color: "#dc2626", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>Required</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        {[60, 90, 120, 150, 180].map(d => (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => setDuration(d)}
                                                style={{
                                                    padding: "8px 14px", borderRadius: "var(--r-cell)",
                                                    border: `2px solid ${duration === d ? "var(--green)" : "var(--sep-opaque)"}`,
                                                    background: duration === d ? "var(--green)" : "var(--bg-grouped)",
                                                    color: duration === d ? "white" : "var(--label-2)",
                                                    fontWeight: 700, fontSize: "0.85rem", cursor: "pointer",
                                                    fontFamily: "inherit", transition: "all 0.15s",
                                                }}
                                            >{d} min</button>
                                        ))}
                                    </div>
                                    <input type="hidden" name="duration" value={duration} />
                                </div>

                                {/* Summary line */}
                                {scheduledDateTime && (
                                    <div style={{ padding: "10px 16px", background: "rgba(28,79,53,0.05)", borderBottom: "1px solid var(--sep)", display: "flex", alignItems: "center", gap: 8 }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                        <span style={{ fontSize: "0.82rem", color: "var(--green)", fontWeight: 600 }}>{fmtScheduledDisplay()}</span>
                                    </div>
                                )}
                                <div style={{ padding: "14px 16px" }} id="field-maxPlayers">
                                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Max Players</div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        {[courts * 4, courts * 4 + 4, courts * 4 + 8].map(n => (
                                            <button key={n} type="button" onClick={() => setMaxPlayers(n)}
                                                style={{
                                                    width: 52, height: 40, borderRadius: "var(--r-cell)",
                                                    border: `2px solid ${maxPlayers === n ? "var(--green)" : "var(--sep-opaque)"}`,
                                                    background: maxPlayers === n ? "var(--green)" : "var(--bg-grouped)",
                                                    color: maxPlayers === n ? "white" : "var(--label-2)",
                                                    fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
                                                    transition: "all 0.15s", fontFamily: "inherit",
                                                }}
                                            >{n}</button>
                                        ))}
                                        <span style={{ fontSize: "0.68rem", color: "var(--label-3)", fontWeight: 600 }}>or</span>
                                        <input
                                            type="number" min="4" max="200"
                                            value={maxPlayers}
                                            onChange={(e) => setMaxPlayers(parseInt(e.target.value, 10) || courts * 4)}
                                            style={{
                                                width: 68, height: 40, padding: "8px 10px", boxSizing: "border-box",
                                                border: "1.5px dashed var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                                fontSize: "0.9rem", fontWeight: 700, textAlign: "center",
                                                fontFamily: "inherit", background: "transparent", color: "var(--label)",
                                            }}
                                            placeholder="Custom"
                                            title="Type a custom max players count"
                                        />
                                    </div>
                                    {fieldErrors.maxPlayers && (
                                        <div style={{ fontSize: "0.74rem", color: "#dc2626", marginTop: 6 }}>{fieldErrors.maxPlayers}</div>
                                    )}
                                </div>
                                <div style={{ padding: "14px 16px", borderTop: "1px solid var(--sep)" }}>
                                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Entry Price</div>
                                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                        <select
                                            value={currency}
                                            onChange={(e) => setCurrency(e.target.value)}
                                            name="currency"
                                            style={{ border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label-3)", outline: "none", cursor: "pointer", flexShrink: 0, fontWeight: 600 }}
                                        >
                                            {["EUR","USD","GBP","QAR","AED","SAR","CHF","SEK","NOK","DKK"].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="number" min="0" step="0.01"
                                            value={price}
                                            onChange={(e) => setPrice(e.target.value)}
                                            name="price"
                                            placeholder="0 = free"
                                            style={{ flex: 1, border: "none", background: "transparent", fontSize: "1.1rem", fontFamily: "inherit", color: "var(--label)", outline: "none", fontWeight: 600 }}
                                        />
                                    </div>
                                </div>
                                {/* Live duration estimate */}
                                {(() => {
                                    const mp = maxPlayers || courts * 4;
                                    const activeCourts = Math.min(courts, Math.floor(mp / 4));
                                    const totalRounds = Math.max(0, mp - 1);
                                    const mins = totalRounds * (pointsPerMatch * 0.5);
                                    const h = Math.floor(mins / 60);
                                    const m = Math.round(mins % 60);
                                    const est = mins > 0 ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : null;
                                    return est ? (
                                        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--sep)", background: "rgba(28,79,53,0.04)" }}>
                                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 2, fontWeight: 600 }}>Estimated Duration</div>
                                            <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--green)" }}>⏱ {est}</div>
                                            <div style={{ fontSize: "0.68rem", color: "var(--label-3)", marginTop: 2 }}>{mp} players · {activeCourts} courts · {pointsPerMatch} pts/match · {totalRounds} rounds</div>
                                        </div>
                                    ) : null;
                                })()}
                                {/* Standby (waitlist) max */}
                                <div style={{ padding: "14px 16px", borderTop: "1px solid var(--sep)" }}>
                                    <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>Max Standby (Waitlist)</div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        {/* Dedup: at low player counts, e.g. maxPlayers=4, two percentages
                                            round to the same integer — without this, two pills would show
                                            the same number. */}
                                        {[...new Set([0.1, 0.25, 0.5, 1.0].map(pct => Math.ceil(maxPlayers * pct)))].map(n => (
                                            <button key={n} type="button" onClick={() => setMaxStandby(n)}
                                                style={{
                                                    width: 52, height: 40, borderRadius: "var(--r-cell)",
                                                    border: `2px solid ${maxStandby === n ? "var(--green)" : "var(--sep-opaque)"}`,
                                                    background: maxStandby === n ? "var(--green)" : "var(--bg-grouped)",
                                                    color: maxStandby === n ? "white" : "var(--label-2)",
                                                    fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
                                                    transition: "all 0.15s", fontFamily: "inherit",
                                                }}
                                            >{n}</button>
                                        ))}
                                        <span style={{ fontSize: "0.68rem", color: "var(--label-3)", fontWeight: 600 }}>or</span>
                                        <input
                                            type="number" min="0" max={maxPlayers}
                                            value={maxStandby}
                                            onChange={(e) => setMaxStandby(Math.min(parseInt(e.target.value, 10) || 0, maxPlayers))}
                                            style={{
                                                width: 68, height: 40, padding: "8px 10px", boxSizing: "border-box",
                                                border: "1.5px dashed var(--sep-opaque)", borderRadius: "var(--r-cell)",
                                                fontSize: "0.9rem", fontWeight: 700, textAlign: "center",
                                                fontFamily: "inherit", background: "transparent", color: "var(--label)",
                                            }}
                                            placeholder="0"
                                            title="Type a custom standby (waitlist) size"
                                        />
                                    </div>
                                    <div style={{ fontSize: "0.68rem", color: "var(--label-3)", marginTop: 6 }}>Auto-set to 10% of max players. Max = {maxPlayers}.</div>
                                </div>
                                <input type="hidden" name="scheduledAt" value={scheduledAt} />
                                <input type="hidden" name="maxPlayers" value={maxPlayers} />
                                <input type="hidden" name="maxStandby" value={maxStandby} />
                            </>
                        )}
                    </div>

                    {/* ── Game Type ── */}
                    {sectionLabel("Game Type")}

                    {/* Info modal */}
                    {infoModal && (
                        <div
                            onClick={() => setInfoModal(null)}
                            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 env(safe-area-inset-bottom)" }}
                        >
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{ background: "var(--bg-card)", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480 }}
                            >
                                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--sep-opaque)", margin: "0 auto 20px" }} />
                                <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--label)", marginBottom: 10 }}>{infoModal.name}</div>
                                <p style={{ fontSize: "0.88rem", color: "var(--label-2)", lineHeight: 1.6, margin: 0 }}>{infoModal.info}</p>
                                <button
                                    type="button"
                                    onClick={() => setInfoModal(null)}
                                    style={{ marginTop: 20, width: "100%", padding: "13px", borderRadius: "var(--r-card)", background: "var(--green)", color: "white", border: "none", fontWeight: 600, fontSize: "0.92rem", cursor: "pointer", fontFamily: "inherit" }}
                                >
                                    Got it
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 24 }}>
                        {PLAY_TYPES.map((pt) => (
                            <div key={pt.id} style={{ position: "relative" }}>
                                <button
                                    type="button"
                                    onClick={() => handleTypeChange(pt.id)}
                                    style={{
                                        width: "100%",
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
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setInfoModal(pt); }}
                                    style={{
                                        position: "absolute", top: 6, right: 6,
                                        width: 20, height: 20, borderRadius: "50%",
                                        border: "1.5px solid var(--sep-opaque)",
                                        background: "var(--bg-card)",
                                        color: "var(--label-3)", fontSize: "0.62rem", fontWeight: 700,
                                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                        fontFamily: "inherit", lineHeight: 1,
                                    }}
                                    title={`About ${pt.name}`}
                                >
                                    i
                                </button>
                            </div>
                        ))}
                    </div>
                    <input type="hidden" name="type" value={selectedType} />
                    <input type="hidden" name="level" value={level || ""} />

                    {/* ── Level ── */}
                    {sectionLabel("Level")}
                    {(() => {
                        const LEVEL_LABELS = ["", "Playtomic 0–1", "Playtomic 0–1.5", "Playtomic 2–3", "Playtomic 3–4", "Playtomic 4+"];
                        const LEVEL_DESC = ["", "Beginner", "Casual / Recreational", "Intermediate Club", "Advanced Club", "Competitive+"];
                        return (
                            <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", padding: "20px", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                                <div style={{ fontSize: "0.72rem", color: "var(--label-3)", marginBottom: 14, lineHeight: 1.5 }}>
                                    Set the required Playtomic level so players know if this tournament suits their skill.
                                </div>
                                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 10 }}>
                                    {[1, 2, 3, 4, 5].map(d => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setLevel(level === d ? null : d)}
                                            style={{
                                                width: 44, height: 44, borderRadius: "50%",
                                                border: `2px solid ${(level || 0) >= d ? "var(--green)" : "var(--sep-opaque)"}`,
                                                background: (level || 0) >= d ? "var(--green)" : "var(--bg-grouped)",
                                                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                                transition: "all 0.15s", flexShrink: 0,
                                            }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill={(level || 0) >= d ? "white" : "var(--sep-opaque)"}>
                                                <circle cx="12" cy="12" r="10"/>
                                            </svg>
                                        </button>
                                    ))}
                                </div>
                                {level ? (
                                    <div style={{ textAlign: "center" }}>
                                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--green)" }}>{LEVEL_LABELS[level]}</div>
                                        <div style={{ fontSize: "0.72rem", color: "var(--label-3)", marginTop: 2 }}>{LEVEL_DESC[level]}</div>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--label-3)" }}>No level set — open to all</div>
                                )}
                            </div>
                        );
                    })()}

                    {/* ── Description ── */}
                    {sectionLabel("Description (optional)")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", marginBottom: 24, boxShadow: "var(--shadow)", overflow: "hidden" }}>
                        <textarea
                            name="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value.slice(0, 120))}
                            placeholder="e.g. Bring your A-game — mixed levels welcome, prizes for top 3!"
                            rows={3}
                            style={{
                                width: "100%", boxSizing: "border-box", padding: "14px 16px",
                                border: "none", background: "transparent", fontSize: "0.9rem",
                                fontFamily: "inherit", color: "var(--label)", outline: "none", resize: "none",
                                lineHeight: 1.6,
                            }}
                        />
                        <div style={{ padding: "0 16px 10px", fontSize: "0.62rem", color: description.length > 100 ? "#f59e0b" : "var(--label-3)", textAlign: "right" }}>
                            {description.length}/120
                        </div>
                    </div>

                    {/* ── Location / Venue ── */}
                    {sectionLabel("Location")}
                    <div
                        id="field-venue"
                        style={{
                            background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24,
                            boxShadow: "var(--shadow)", position: "relative",
                            border: fieldErrors.venue ? "1.5px solid #dc2626" : "1.5px solid transparent",
                        }}
                    >
                        {/* Hidden inputs */}
                        <input type="hidden" name="location" value={locationOverride || (selectedVenue ? `${selectedVenue.name}, ${selectedVenue.city || ""}` : venueQuery)} />
                        <input type="hidden" name="venueId" value={selectedVenue?.id || ""} />
                        <input type="hidden" name="latitude" value={lat || selectedVenue?.latitude || ""} />
                        <input type="hidden" name="longitude" value={lng || selectedVenue?.longitude || ""} />

                        {fieldErrors.venue && (
                            <div style={{ padding: "10px 16px", background: "#fef2f2", color: "#991b1b", fontSize: "0.78rem", fontWeight: 600, borderBottom: "1px solid #fca5a5" }}>
                                {fieldErrors.venue}
                            </div>
                        )}

                        {/* Google Maps URL — first, drives everything */}
                        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--sep)", background: "rgba(28,79,53,0.03)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", fontWeight: 600 }}>Google Maps URL</div>
                                <span style={{ fontSize: "0.6rem", background: "rgba(239,68,68,0.1)", color: "#dc2626", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>Required for public</span>
                                <span style={{ fontSize: "0.6rem", background: "rgba(28,79,53,0.1)", color: "var(--green)", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>Auto-fills below</span>
                            </div>
                            <input
                                value={googleMapsUrl}
                                onChange={(e) => { setGoogleMapsUrl(e.target.value); if (fieldErrors.venue) setFieldErrors(prev => ({ ...prev, venue: undefined })); }}
                                onBlur={handleMapsUrlBlur}
                                placeholder="Paste a Google Maps link"
                                type="url"
                                className="nopa-input-ellipsis"
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.88rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
                            />
                            <div style={{ fontSize: "0.68rem", color: "var(--label-3)", marginTop: 4 }}>Fills in venue, city, country, and currency below.</div>
                            <input type="hidden" name="googleMapsUrl" value={googleMapsUrl} />
                            {mapsLoading && (
                                <div style={{ fontSize: "0.72rem", color: "var(--label-3)", marginTop: 4 }}>Detecting location…</div>
                            )}
                            {mapsResult && !mapsLoading && (
                                <div style={{ fontSize: "0.72rem", color: "var(--green)", marginTop: 4 }}>
                                    Detected: <strong>{[mapsResult.venueName, mapsResult.city, mapsResult.country].filter(Boolean).join(", ")}</strong>
                                    {mapsResult.currency !== "EUR" && ` · Currency set to ${mapsResult.currency}`}
                                </div>
                            )}
                            {mapsError && !mapsLoading && (
                                <div style={{ fontSize: "0.72rem", color: "#b91c1c", marginTop: 4 }}>{mapsError} — fill fields manually</div>
                            )}
                            {googleMapsUrl && (
                                <a href={googleMapsUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.7rem", color: "var(--green)", marginTop: 4, display: "block" }}>
                                    ↗ Preview on Maps
                                </a>
                            )}
                        </div>

                        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--sep)", position: "relative" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>
                                Venue Name {mapsResult?.venueName && <span style={{ color: "var(--green)", textTransform: "none", letterSpacing: 0 }}>✓ auto-filled</span>}
                            </div>
                            <input
                                value={venueQuery}
                                onChange={(e) => { setVenueQuery(e.target.value); setLocationOverride(e.target.value); setSelectedVenue(null); if (fieldErrors.venue) setFieldErrors(prev => ({ ...prev, venue: undefined })); }}
                                placeholder="e.g. Aspire Zone Padel Courts"
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
                            />
                            {/* Autocomplete dropdown */}
                            {venuePredictions.length > 0 && (
                                <div style={{
                                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
                                    background: "white", borderRadius: "0 0 var(--r-card) var(--r-card)",
                                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)", overflow: "hidden",
                                }}>
                                    {venuePredictions.map((p) => (
                                        <button
                                            key={p.placeId}
                                            type="button"
                                            onMouseDown={() => handleVenueSelect(p)}
                                            style={{
                                                display: "block", width: "100%", textAlign: "left",
                                                padding: "12px 16px", border: "none", background: "transparent",
                                                cursor: "pointer", fontFamily: "inherit", borderBottom: "1px solid var(--sep)",
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(28,79,53,0.06)"}
                                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                        >
                                            <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--label)" }}>{p.mainText}</div>
                                            <div style={{ fontSize: "0.74rem", color: "var(--label-3)", marginTop: 2 }}>{p.secondaryText}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {venueLoading && (
                                <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: "0.72rem", color: "var(--label-3)" }}>
                                    Searching…
                                </div>
                            )}
                        </div>

                        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>
                                City / District {mapsResult?.city && <span style={{ color: "var(--green)", textTransform: "none", letterSpacing: 0 }}>✓ auto-filled</span>}
                            </div>
                            <input
                                value={city}
                                onChange={(e) => { setCity(e.target.value); if (fieldErrors.venue) setFieldErrors(prev => ({ ...prev, venue: undefined })); }}
                                placeholder="e.g. Doha — Aspire Zone"
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
                            />
                            <input type="hidden" name="city" value={city} />
                        </div>

                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 6, fontWeight: 600 }}>
                                Country {mapsResult?.country && <span style={{ color: "var(--green)", textTransform: "none", letterSpacing: 0 }}>✓ auto-filled</span>}
                            </div>
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

                    {/* ── Match Settings ── */}
                    {sectionLabel("Match Settings")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 12, fontWeight: 600 }}>Points per Match</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <div style={{ fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--label-3)", fontWeight: 600, paddingLeft: 4 }}>
                                        Points to win
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

                        {stats && (
                            <div style={{ padding: "14px 16px", background: "rgba(28,79,53,0.05)", borderTop: "1px solid var(--sep)", display: "flex", alignItems: "center", gap: 10 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                <div style={{ fontSize: "0.82rem", color: "var(--green)", fontWeight: 600 }}>
                                    Estimated duration: ~{stats.duration} &nbsp;·&nbsp; {stats.totalRounds} rounds &nbsp;·&nbsp; {stats.activeCourts} active court{stats.activeCourts !== 1 ? "s" : ""}
                                </div>
                            </div>
                        )}

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

                    {/* ── Players ── */}
                    {sectionLabel("Players")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--sep)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--label)" }}>
                                {playerSlots.filter(s => s.trim()).length} / {courts * 4} players
                            </span>
                            <button type="button" onClick={() => setPlayerSlots(Array(courts * 4).fill(""))}
                                style={{ background: "none", border: "none", color: "var(--label-3)", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
                                Clear all
                            </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0 }}>
                            {playerSlots.map((val, i) => (
                                <div key={i} style={{ padding: "10px 14px", borderBottom: i < playerSlots.length - 2 ? "1px solid var(--sep)" : "none", borderRight: i % 2 === 0 ? "1px solid var(--sep)" : "none" }}>
                                    <div style={{ fontSize: "0.52rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>
                                        Player {i + 1}
                                    </div>
                                    <input
                                        value={val}
                                        onChange={e => setPlayerSlots(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                                        placeholder="Name (optional)"
                                        style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.92rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
                                    />
                                </div>
                            ))}
                        </div>
                        <input type="hidden" name="slotCount" value={playerSlots.length} />
                        {playerSlots.map((val, i) => (
                            <input key={i} type="hidden" name={`playerSlot_${i}`} value={val} />
                        ))}
                    </div>

                    {/* ── Organiser ── */}
                    {sectionLabel("Organiser")}
                    <div style={{ background: "var(--bg-card)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow)" }}>
                        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--sep)" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>
                                Your Name <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--label-3)", fontWeight: 400 }}>— visible to players</span>
                            </div>
                            <input
                                name="organizerName"
                                placeholder="e.g. Maikel"
                                autoComplete="name"
                                value={organizerName}
                                onChange={(e) => setOrganizerName(e.target.value)}
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
                            />
                        </div>
                        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--sep)" }} id="field-hostPassword">
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>
                                Host Password {isPublic && <span style={{ fontSize: "0.6rem", background: "rgba(239,68,68,0.1)", color: "#dc2626", borderRadius: 4, padding: "1px 5px", fontWeight: 700, marginLeft: 4 }}>Required</span>} <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--label-3)", fontWeight: 400 }}>— remember this to start the match or make changes</span>
                            </div>
                            <input
                                name="hostPassword"
                                type="password"
                                autoComplete="new-password"
                                placeholder="Choose a password"
                                value={hostPassword}
                                onChange={(e) => { setHostPassword(e.target.value); if (fieldErrors.hostPassword) setFieldErrors(prev => ({ ...prev, hostPassword: undefined })); }}
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: fieldErrors.hostPassword ? "#dc2626" : "var(--label)", outline: "none" }}
                            />
                            {fieldErrors.hostPassword && (
                                <div style={{ fontSize: "0.74rem", color: "#dc2626", marginTop: 6 }}>{fieldErrors.hostPassword}</div>
                            )}
                        </div>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--label-3)", marginBottom: 4, fontWeight: 600 }}>
                                Your Email <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--label-3)", fontWeight: 400 }}>— for password recovery</span>
                            </div>
                            <input
                                name="hostEmail"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                value={hostEmail}
                                onChange={(e) => setHostEmail(e.target.value)}
                                style={{ width: "100%", border: "none", background: "transparent", fontSize: "0.95rem", fontFamily: "inherit", color: "var(--label)", outline: "none" }}
                            />
                        </div>
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
                        disabled={(!isScheduled && playerSlots.filter(s => s.trim()).length < minPlayers) || isSubmitting}
                        style={{
                            width: "100%", padding: "16px", borderRadius: "var(--r-card)",
                            background: (isScheduled || playerSlots.filter(s => s.trim()).length >= minPlayers) ? "var(--green)" : "var(--sep-opaque)",
                            color: "white", fontWeight: 600, fontSize: "1rem",
                            border: "none", cursor: (isScheduled || playerSlots.filter(s => s.trim()).length >= minPlayers) ? "pointer" : "not-allowed",
                            fontFamily: "inherit", transition: "background 0.2s",
                            boxShadow: (isScheduled || playerSlots.filter(s => s.trim()).length >= minPlayers) ? "0 4px 16px rgba(28,79,53,0.3)" : "none",
                        }}
                    >
                        {isSubmitting
                            ? "Creating..."
                            : isScheduled
                                ? `Schedule Tournament · open for ${maxPlayers} players`
                                : playerSlots.filter(s => s.trim()).length < minPlayers
                                    ? `Need ${minPlayers - playerSlots.filter(s => s.trim()).length} more to start · ${courts * 4} for full setup`
                                    : `Create Tournament · ${playerSlots.filter(s => s.trim()).length} players`}
                    </button>
                </Form>
            </div>
        </>
    );
}
