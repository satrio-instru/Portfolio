import { supabaseAdmin } from "../lib/supabase-admin.js";

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token autentikasi tidak ditemukan." });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Token tidak valid atau sudah kedaluwarsa." });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Gagal memverifikasi token." });
  }
}
