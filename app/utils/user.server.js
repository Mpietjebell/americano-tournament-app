import prisma from "../db.server";

export function getUserIdFromRequest(request) {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/nopa_user=([^;]+)/);
    return match ? match[1] : null;
}

/** The signed-in Clubhouse account for this request, or null. */
export async function getUser(request) {
    const userId = getUserIdFromRequest(request);
    if (!userId) return null;
    return prisma.tournamentUser.findUnique({ where: { id: userId } });
}

/** What the browser may know about the signed-in user (never the id — it is the login cookie). */
export function publicUser(user) {
    return user ? { username: user.username, email: user.email, city: user.city || null, avatar: user.avatarKey ? `/app/play/avatar/${user.avatarKey}` : null } : null;
}

export function userCookie(userId) {
    return `nopa_user=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

export const clearUserCookie = "nopa_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
