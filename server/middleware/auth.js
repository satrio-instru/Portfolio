import { supabaseAdmin } from "../lib/supabase-admin.js";

export async function authMiddleware(req, res, next) {
  // Ensure CORS headers on auth error responses
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token autentikasi tidak ditemukan." });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      console.warn("Auth failed:", error?.message || "user not found");
      return res.status(401).json({ error: "Token tidak valid atau sudah kedaluwarsa." });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth exception:", err.message);
    return res.status(401).json({ error: "Gagal memverifikasi token." });
  }
}
