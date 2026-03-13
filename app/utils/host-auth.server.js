const HOST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function escapeCookieValue(value) {
  return encodeURIComponent(value);
}

export function getHostCookieName(tournamentId) {
  return `nopa_host_${tournamentId}`;
}

export function getHostTokenFromRequest(request, tournamentId) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${getHostCookieName(tournamentId)}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function createHostCookie(tournamentId, hostToken) {
  return `${getHostCookieName(tournamentId)}=${escapeCookieValue(hostToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${HOST_COOKIE_MAX_AGE}`;
}

