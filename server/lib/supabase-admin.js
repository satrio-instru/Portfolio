import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("⚠️  SUPABASE_URL and/or SUPABASE_SERVICE_KEY not set. All authenticated API routes will return 401.");
  console.error("   Set these environment variables in your hosting dashboard (Render, Vercel, etc.)");
}

export const supabaseAdmin = createClient(supabaseUrl || "", supabaseServiceKey || "");
