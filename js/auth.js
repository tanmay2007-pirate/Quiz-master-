// =====================================================================
// QuizMaster: Authentication & Profile Service
// File: js/auth.js
// Description:
//   Handles user sign up, sign in, sign out, and profile/role fetching
//   using Supabase Auth and the profiles table.
// =====================================================================

import { supabase } from "./supabaseClient.js";

/**
 * Signs up a new student account.
 * Note: By security requirement, all public sign-ups default to 'student'.
 */
export async function signUpStudent(email, password, displayName, role = "student", invitationCode = "") {
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  if (!["student", "teacher"].includes(role)) {
    throw new Error("Invalid account type.");
  }

  // 1. Trigger Supabase Auth sign-up
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split("@")[0],
        requested_role: role,
        teacher_invitation_code: role === "teacher" ? invitationCode : null,
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Signs in an existing user (teacher or student) with email and password.
 */
export async function signInUser(email, password) {
  if (!supabase) {
    throw new Error("Supabase client is not initialized.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Signs out the currently authenticated user.
 */
export async function signOutUser() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error signing out:", error);
    throw error;
  }
}

/**
 * Retrieves the currently signed-in user and their profile record (including role).
 * Role is strictly loaded from the database profiles table, never trusted from client.
 */
export async function getCurrentUserProfile() {
  if (!supabase) return null;

  // 1. Get current auth session user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // 2. Fetch the protected profile record from PostgreSQL
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, created_at")
    .eq("id", user.id)
    .single();

  if (error) {
    console.warn("Profile fetch error (might need initial insert):", error);
    return {
      user,
      profile: {
        id: user.id,
        display_name: user.user_metadata?.display_name || user.email.split("@")[0],
        role: "student", // Safe default
      },
    };
  }

  return { user, profile };
}

/**
 * Listens for auth state changes (sign in, sign out, token refresh).
 */
export function onAuthStateChange(callback) {
  if (!supabase) return;
  return supabase.auth.onAuthStateChange(async (event, session) => {
    callback(event, session);
  });
}
