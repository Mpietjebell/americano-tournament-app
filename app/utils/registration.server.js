import prisma from "../db.server";
import { sendSignupConfirmation, sendTournamentConfirmed } from "./email.server";

/**
 * One source of truth for "who is in, who is waiting, is there room".
 *
 * A Player row is a confirmed spot. A participant with a standbyPosition is
 * on the waitlist and must not count as a player — older sign-ups created a
 * Player row for standby people too, so those are filtered out here by id.
 *
 * `tournament` needs `players` (id, name) and `participants`
 * (playerId, standbyPosition, name).
 */
export function getRoster(tournament) {
    const participants = tournament.participants || [];
    const standby = participants
        .filter((p) => p.standbyPosition != null)
        .sort((a, b) => a.standbyPosition - b.standbyPosition);
    const standbyPlayerIds = new Set(standby.map((p) => p.playerId).filter(Boolean));
    const activePlayers = (tournament.players || []).filter((p) => !standbyPlayerIds.has(p.id));

    const maxPlayers = tournament.maxPlayers || null;
    const activeCount = activePlayers.length;
    const standbyCount = standby.length;
    const isFull = maxPlayers != null && activeCount >= maxPlayers;
    const standbyFull = isFull && tournament.maxStandby != null && standbyCount >= tournament.maxStandby;

    return {
        activePlayers,
        standby,
        standbyPlayerIds,
        activeCount,
        standbyCount,
        maxPlayers,
        spotsLeft: maxPlayers != null ? Math.max(0, maxPlayers - activeCount) : null,
        isFull,
        standbyFull,
    };
}

const fail = (status, code, error) => ({ ok: false, status, code, error });

/**
 * Sign a new person up for a tournament: a confirmed spot while there is
 * room, the standby list once it is full. Used by both the in-app join page
 * and the public sign-up API so the two can never disagree about capacity.
 */
export async function registerPlayer({ tournamentId, name, email, phone }) {
    name = (name || "").trim();
    email = (email || "").trim().toLowerCase();
    phone = (phone || "").trim() || null;

    if (name.length < 2) return fail(400, "invalid_name", "Please enter your full name.");
    if (!email.includes("@")) return fail(400, "invalid_email", "Please enter a valid email address.");

    const banned = await prisma.bannedSignup.findUnique({ where: { email } });
    if (banned) return fail(403, "email_banned", "This email address has been banned from signing up for NOPA tournaments.");

    const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        include: {
            players: { select: { id: true, name: true } },
            participants: { select: { id: true, email: true, name: true, playerId: true, standbyPosition: true } },
            venue: true,
        },
    });
    if (!tournament) return fail(404, "not_found", "Tournament not found.");
    if (tournament.status !== "setup") {
        return fail(409, "tournament_started", "This tournament has already started — new sign-ups are closed.");
    }
    if (tournament.participants.some((p) => p.email === email)) {
        return fail(409, "already_signed_up", "This email address is already signed up for this tournament.");
    }

    const roster = getRoster(tournament);

    if (roster.isFull) {
        if (roster.standbyFull) {
            return fail(409, "tournament_full", "This tournament and its standby list are both full.");
        }
        const position = roster.standby.reduce((max, p) => Math.max(max, p.standbyPosition), 0) + 1;
        // No Player row until promoted: a Player is a confirmed spot, and
        // round generation schedules every Player it finds.
        await prisma.tournamentParticipant.create({
            data: { email, phone, name, tournamentId, standbyPosition: position },
        });
        sendSignupConfirmation({ to: email, name, tournament, position }).catch(() => {});
        return { ok: true, standby: true, position, max: roster.maxPlayers, tournament };
    }

    const player = await prisma.player.create({
        data: { name, gender: "unspecified", tournamentId },
    });
    await prisma.tournamentParticipant.create({
        data: { email, phone, name, tournamentId, playerId: player.id },
    });

    const position = roster.activeCount + 1;
    sendSignupConfirmation({ to: email, name, tournament, position }).catch(() => {});
    if (roster.maxPlayers && position >= roster.maxPlayers) {
        sendTournamentConfirmed({ participants: [...tournament.participants, { email, name }], tournament }).catch(() => {});
    }

    return { ok: true, standby: false, position, max: roster.maxPlayers, playerId: player.id, tournament };
}
