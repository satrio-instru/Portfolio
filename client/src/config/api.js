export const API_BASE = import.meta.env.VITE_API_BASE || "/api";
export const UPLOAD_URL = import.meta.env.VITE_UPLOAD_URL || API_BASE;

export async function api(pathName, options = {}) {
  const response = await fetch(`${API_BASE}${pathName}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request gagal (${response.status})`);
  }
  return response.json();
}
