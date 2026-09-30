import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => any;
};

async function assertStaff(supabase: SupabaseLike, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("owner") && !roles.includes("admin")) throw new Error("Not authorized");
  return roles as string[];
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    const roles = await assertStaff(supabase, context.userId);

    const [statsRes, usersRes, jobsRes, settingsRes, reportsRes] = await Promise.all([
      supabase.rpc("admin_stats", {}),
      supabase.from("profiles").select("id, email, display_name, purchased_credits, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("generations").select("id, user_id, kind, status, prompt, credits_cost, is_demo, provider, created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("app_settings").select("key, value, is_public"),
      supabase.from("reports").select("id, reason, details, status, created_at, generation_id").order("created_at", { ascending: false }).limit(50),
    ]);

    const { data: roleRows } = await supabase.from("user_roles").select("user_id, role");

    return {
      roles,
      stats: (statsRes.data ?? {}) as Record<string, number>,
      users: (usersRes.data ?? []) as {
        id: string;
        email: string | null;
        display_name: string | null;
        purchased_credits: number;
        created_at: string;
      }[],
      userRoles: (roleRows ?? []) as { user_id: string; role: string }[],
      jobs: (jobsRes.data ?? []) as Record<string, unknown>[],
      settings: (settingsRes.data ?? []) as { key: string; value: Record<string, unknown>; is_public: boolean }[],
      reports: (reportsRes.data ?? []) as Record<string, unknown>[],
    };
  });

export const adjustUserCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), delta: z.number().int().min(-100000).max(100000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    const { data: result, error } = await supabase.rpc("admin_adjust_credits", {
      _user_id: data.userId,
      _delta: data.delta,
    });
    if (error) throw new Error(error.message);
    return { balance: result as number };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["admin", "user"]), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    const { error } = await supabase.rpc("admin_set_role", {
      _user_id: data.userId,
      _role: data.role,
      _enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const saveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ key: z.string().min(1).max(60), value: z.record(z.unknown()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    await assertStaff(supabase, context.userId);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: data.value, updated_at: new Date().toISOString() })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateReportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["open", "reviewing", "resolved", "dismissed"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    await assertStaff(supabase, context.userId);
    const { error } = await supabase.from("reports").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Secure owner designation after deployment.
 *
 * Set the secret OWNER_SETUP_TOKEN in Project Settings -> Secrets, then the
 * signed-in account that submits the matching token once on the Account page
 * becomes the site owner. No owner email is hardcoded in client code, and the
 * token can only be claimed while no owner exists.
 */
export const claimOwnerRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const expected = process.env["OWNER_SETUP_TOKEN"] ?? "";
    if (!expected) {
      return { ok: false as const, message: "Owner setup is not configured yet. Add the OWNER_SETUP_TOKEN secret first." };
    }
    if (data.token !== expected) {
      return { ok: false as const, message: "That setup token is not valid." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: readError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "owner")
      .limit(1);
    if (readError) throw new Error(readError.message);
    if (existing && existing.length > 0) {
      return { ok: false as const, message: "An owner has already been designated for this site." };
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "owner" });
    if (error) throw new Error(error.message);
    return { ok: true as const, message: "You are now the site owner." };
  });

export const ownerSetupState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "owner").limit(1);
    return {
      ownerExists: Boolean(data && data.length > 0),
      tokenConfigured: Boolean(process.env["OWNER_SETUP_TOKEN"]),
    };
  });
