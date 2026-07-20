/**
 * apiFetch.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Thin wrapper around fetch() that automatically handles 401 "Session expired"
 * responses by dispatching a global event that AuthContext listens to.
 *
 * Usage:
 *   const data = await apiFetch("/api/files/public", { headers: {...} });
 *
 * If the response is 401, the user is auto-logged-out and redirected to login.
 */

const API_BASE = "http://localhost:5000";

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res  = await fetch(url, options);

  if (res.status === 401) {
    // Fire a global event — AuthContext will clear the session
    window.dispatchEvent(new Event("gv:session-expired"));
  }

  return res;
}
