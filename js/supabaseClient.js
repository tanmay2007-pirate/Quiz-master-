// =====================================================================
// QuizMaster: Supabase Client Initializer
// File: js/supabaseClient.js
// =====================================================================

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

// Check that the Supabase CDN script loaded properly
if (!window.supabase || typeof window.supabase.createClient !== "function") {
  console.error("Supabase CDN library is not loaded. Please verify index.html script tag.");
}

// Create and export the Supabase client instance
export const supabase = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

