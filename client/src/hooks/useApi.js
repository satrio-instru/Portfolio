import { useCallback } from "react";
import { API_BASE } from "../config/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export function useApi() {
  const { session } = useAuth();
  const { showToast } = useToast();

  const apiCall = useCallback(
    async (pathName, options = {}) => {
      const headers = { ...options.headers };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${API_BASE}${pathName}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = body.error || `Request gagal (${response.status})`;
        showToast(message, "error");
        throw new Error(message);
      }

      return response.json();
    },
    [session, showToast],
  );

  return { api: apiCall };
}
