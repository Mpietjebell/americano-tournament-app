import { randomBytes } from "node:crypto";
import prisma from "../db.server";

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_LENGTH = 150_000; // ~110 KB of image; the browser resizes to 256px before upload

/**
 * Validates an avatar the browser sent as a data URL.
 * Returns { avatar, avatarKey } to store, or { error }.
 * A fresh key per upload means the image URL changes, so caches never show the old one.
 */
export function parseAvatarUpload(value) {
    const dataUrl = (value || "").toString();
    if (!dataUrl) return { skip: true };
    if (!DATA_URL.test(dataUrl)) return { error: "That file is not a supported image (JPG, PNG or WebP)." };
    if (dataUrl.length > MAX_LENGTH) return { error: "That image is too large. Try a smaller photo." };
    return { avatar: dataUrl, avatarKey: randomBytes(9).toString("base64url") };
}

export const avatarUrl = (avatarKey) => (avatarKey ? `/app/play/avatar/${avatarKey}` : null);

/**
 * Photo avatars for a tournament's players: a player gets one when the email
 * they joined with belongs to a Clubhouse account that has an avatar.
 * Returns { [playerId]: url } — emails never leave the server.
 */
export async function getPlayerAvatars(tournamentId) {
    const participants = await prisma.tournamentParticipant.findMany({
        where: { tournamentId, playerId: { not: null } },
        select: { playerId: true, email: true },
    });
    const emails = [...new Set(participants.map((p) => p.email).filter(Boolean))];
    if (emails.length === 0) return {};
    const users = await prisma.tournamentUser.findMany({
        where: { email: { in: emails }, avatarKey: { not: null } },
        select: { email: true, avatarKey: true },
    });
    const byEmail = new Map(users.map((u) => [u.email, u.avatarKey]));
    const result = {};
    for (const p of participants) {
        const key = byEmail.get(p.email);
        if (key) result[p.playerId] = avatarUrl(key);
    }
    return result;
}
