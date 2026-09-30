import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const imageSchema = z.object({
  prompt: z.string().min(1).max(2000),
  negativePrompt: z.string().max(1000).optional().nullable(),
  model: z.string().max(120).optional().nullable(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16"]),
  quality: z.enum(["standard", "high", "ultra"]),
  count: z.number().int().min(1).max(4),
  mature: z.boolean().optional().default(false),
});

const videoSchema = z.object({
  prompt: z.string().max(2000),
  model: z.string().max(120).optional().nullable(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "auto"]),
  quality: z.enum(["standard", "high", "ultra"]),
  durationSeconds: z.number().int().min(2).max(12),
  sourceImageUrl: z.string().max(5_000_000).optional().nullable(),
  mature: z.boolean().optional().default(false),
});

/** Mature mode is only honoured when the server-side profile says the adult opted in. */
async function matureAllowed(supabase: SupabaseLike, userId: string) {
  const { data } = await supabase.from("profiles").select("adult_confirmed_at, mature_enabled").eq("id", userId).maybeSingle();
  return Boolean(data?.adult_confirmed_at && data?.mature_enabled);
}

export const getMatureSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    const { data } = await supabase.from("profiles").select("adult_confirmed_at, mature_enabled").eq("id", context.userId).maybeSingle();
    return { adultConfirmed: Boolean(data?.adult_confirmed_at), matureEnabled: Boolean(data?.adult_confirmed_at && data?.mature_enabled) };
  });

export const confirmAdult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ confirmed: z.literal(true) }).parse(input))
  .handler(async ({ context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    const { error } = await supabase.rpc("confirm_adult", {});
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setMatureMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    const { error } = await supabase.rpc("set_mature_mode", { _enabled: data.enabled });
    if (error) throw new Error(error.message.includes("age") ? "Confirm you are 18 or older first." : error.message);
    return { ok: true as const, enabled: data.enabled };
  });

type CreditSettings = { daily_free_credits: number; image_cost: number; video_cost: number };

async function readCosts(supabase: {
  from: (t: string) => {
    select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { value: unknown } | null }> } };
  };
}): Promise<CreditSettings> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "credits").maybeSingle();
  const value = (data?.value ?? {}) as Partial<CreditSettings>;
  return {
    daily_free_credits: value.daily_free_credits ?? 5,
    image_cost: value.image_cost ?? 1,
    video_cost: value.video_cost ?? 3,
  };
}

export const getCreditStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as never as {
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      from: (t: string) => never;
    };
    const { data, error } = await supabase.rpc("credit_status", {});
    if (error) throw new Error(error.message);
    const costs = await readCosts(context.supabase as never);
    return { status: data as Record<string, number | boolean>, costs };
  });

export const createImageGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => imageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { moderatePrompt, runImageJob, providerConfig, REPLICATE_IMAGE_MODELS, DEFAULT_REPLICATE_IMAGE_MODEL } =
      await import("./providers.server");
    const supabase = context.supabase as never as SupabaseLike;
    const mature = data.mature ? await matureAllowed(supabase, context.userId) : false;
    if (data.mature && !mature) {
      return { ok: false as const, reason: "blocked" as const, message: "Mature Content is off. Confirm you're 18+ and turn it on in Account." };
    }
    const check = moderatePrompt(data.prompt, { mature });
    if (!check.allowed) return { ok: false as const, reason: "blocked" as const, message: check.reason };

    const costs = await readCosts(supabase as never);
    const cost = costs.image_cost * data.count;

    const { data: gate, error: gateError } = await supabase.rpc("check_generation_allowed", { _kind: "image" });
    if (gateError) throw new Error(gateError.message);
    const gateResult = gate as { ok: boolean; reason?: string; limit?: number };
    if (!gateResult.ok) return blockedByGate(gateResult);

    const { data: spend, error: spendError } = await supabase.rpc("consume_credits", { _cost: cost });
    if (spendError) throw new Error(spendError.message);
    const spendResult = spend as { ok: boolean; reason?: string; available?: number; from_free?: number; from_purchased?: number };
    const usageDate = new Date().toISOString().slice(0, 10);
    if (!spendResult.ok) {
      return { ok: false as const, reason: "insufficient_credits", needed: cost, available: spendResult.available ?? 0 };
    }

    const cfg = providerConfig("image");
    const resolvedModel =
      REPLICATE_IMAGE_MODELS[data.model ?? ""]?.id ?? REPLICATE_IMAGE_MODELS[DEFAULT_REPLICATE_IMAGE_MODEL]!.id;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: row, error: insertError } = await db
      .from("generations")
      .insert({
        user_id: context.userId,
        kind: "image",
        status: "running",
        prompt: data.prompt,
        negative_prompt: data.negativePrompt ?? null,
        model: cfg.replicate ? resolvedModel : (data.model ?? null),
        provider: cfg.name,
        aspect_ratio: data.aspectRatio,
        quality: data.quality,
        output_count: data.count,
        credits_cost: cost,
        is_demo: !cfg.configured,
        is_mature: mature,
      })
      .select("*")
      .single();
    if (insertError) {
      await refundSpend(context.userId, spendResult, usageDate);
      throw new Error(insertError.message);
    }

    try {
      const raw = await runImageJob({
        prompt: data.prompt,
        negativePrompt: data.negativePrompt ?? null,
        model: data.model ?? null,
        aspectRatio: data.aspectRatio,
        quality: data.quality,
        count: data.count,
      });
      const result = raw.demo ? raw : { ...raw, outputs: await persistOutputs(context.userId, row.id, raw.outputs) };
      const { data: done, error: updateError } = await db
        .from("generations")
        .update({
          status: "succeeded",
          outputs: result.outputs,
          provider: result.provider,
          provider_job_id: result.jobId ?? null,
          is_demo: result.demo,
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select("*")
        .single();
      if (updateError) throw new Error(updateError.message);
      return { ok: true as const, generation: done };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      await db.from("generations").update({ status: "failed", error: message }).eq("id", row.id);
      await refundSpend(context.userId, spendResult, usageDate);
      return providerFailure(error, message);
    }
  });

export const createVideoGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => videoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const p = await import("./providers.server");
    const supabaseEarly = context.supabase as never as SupabaseLike;
    const mature = data.mature ? await matureAllowed(supabaseEarly, context.userId) : false;
    if (data.mature && !mature) {
      return { ok: false as const, reason: "blocked" as const, message: "Mature Content is off. Confirm you're 18+ and turn it on in Account." };
    }
    const check = p.moderatePrompt(data.prompt || "animate this image", { mature });
    if (!check.allowed) return { ok: false as const, reason: "blocked" as const, message: check.reason };
    const useReplicate = p.replicateVideoConfigured();
    if (useReplicate && !data.sourceImageUrl) {
      return { ok: false as const, reason: "invalid" as const, message: "Upload a reference image first." };
    }
    if (data.sourceImageUrl && !/^data:image\/(png|jpe?g|webp);base64,/.test(data.sourceImageUrl)) {
      return { ok: false as const, reason: "invalid" as const, message: "Reference image must be PNG, JPG or WebP." };
    }

    const supabase = context.supabase as never as SupabaseLike;
    const costs = await readCosts(supabase as never);
    const cost = costs.video_cost;

    const { data: gate, error: gateError } = await supabase.rpc("check_generation_allowed", { _kind: "video" });
    if (gateError) throw new Error(gateError.message);
    const gateResult = gate as { ok: boolean; reason?: string; limit?: number };
    if (!gateResult.ok) return blockedByGate(gateResult);
    const { data: spend, error: spendError } = await supabase.rpc("consume_credits", { _cost: cost });
    if (spendError) throw new Error(spendError.message);
    const spendResult = spend as { ok: boolean; available?: number; from_free?: number; from_purchased?: number };
    if (!spendResult.ok) {
      return { ok: false as const, reason: "insufficient_credits", needed: cost, available: spendResult.available ?? 0 };
    }
    const usageDate = new Date().toISOString().slice(0, 10);
    const modelKey = p.REPLICATE_VIDEO_MODELS[data.model ?? ""] ? data.model! : p.DEFAULT_REPLICATE_VIDEO_MODEL;

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: row, error: insertError } = await db
      .from("generations")
      .insert({
        user_id: context.userId,
        kind: "video",
        status: "queued",
        prompt: data.prompt,
        model: useReplicate ? p.REPLICATE_VIDEO_MODELS[modelKey]!.id : (data.model ?? null),
        provider: useReplicate ? "replicate" : p.providerConfig("video").name,
        aspect_ratio: data.aspectRatio,
        quality: data.quality,
        duration_seconds: data.durationSeconds,
        output_count: 1,
        credits_cost: cost,
        is_demo: !useReplicate && !p.providerConfig("video").configured,
        is_mature: mature,
      })
      .select("*")
      .single();
    if (insertError) {
      await refundSpend(context.userId, spendResult, usageDate);
      throw new Error(insertError.message);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("generation_charges" as never).insert({
      generation_id: row.id,
      user_id: context.userId,
      from_free: spendResult.from_free ?? 0,
      from_purchased: spendResult.from_purchased ?? 0,
      usage_date: usageDate,
    } as never);

    try {
      let sourceUrl: string | null = null;
      if (data.sourceImageUrl) sourceUrl = await storeSourceImage(context.userId, row.id, data.sourceImageUrl);

      if (useReplicate) {
        const started = await p.startReplicateVideo({
          prompt: data.prompt || "subtle natural motion, cinematic",
          model: modelKey,
          quality: data.quality,
          durationSeconds: data.durationSeconds,
          imageUrl: sourceUrl!,
        });
        await supabaseAdmin
          .from("generation_charges" as never)
          .update({ provider_job_id: started.jobId } as never)
          .eq("generation_id", row.id);
        const { data: queued } = await db
          .from("generations")
          .update({
            status: "running",
            provider_job_id: started.jobId,
            source_image_url: sourceUrl,
            duration_seconds: Math.round(started.seconds),
          })
          .eq("id", row.id)
          .select("*")
          .single();
        return { ok: true as const, pending: true as const, generation: queued ?? row };
      }

      const result = await p.runVideoJob({
        prompt: data.prompt,
        model: data.model ?? null,
        aspectRatio: data.aspectRatio,
        quality: data.quality,
        durationSeconds: data.durationSeconds,
        sourceImageUrl: sourceUrl,
      });
      const { data: done, error: updateError } = await db
        .from("generations")
        .update({
          status: "succeeded",
          outputs: result.outputs,
          provider: result.provider,
          is_demo: result.demo,
          source_image_url: sourceUrl,
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select("*")
        .single();
      if (updateError) throw new Error(updateError.message);
      await markFinalized(row.id);
      return { ok: true as const, pending: false as const, generation: done };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      await db.from("generations").update({ status: "failed", error: message }).eq("id", row.id);
      await refundCharge(row.id);
      return providerFailure(error, message);
    }
  });

/** Poll a running video job. Ownership is enforced by RLS on the generations read. */
export const checkVideoGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    const { data: row } = await supabase.from("generations").select("*").eq("id", data.id).maybeSingle();
    if (!row) return { ok: false as const, message: "Job not found." };
    if (row.status !== "running" && row.status !== "queued") return { ok: true as const, generation: row };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: charge } = (await supabaseAdmin
      .from("generation_charges" as never)
      .select("provider_job_id, user_id")
      .eq("generation_id", data.id)
      .maybeSingle()) as { data: { provider_job_id: string | null; user_id: string } | null };
    if (!charge?.provider_job_id || charge.user_id !== context.userId) {
      return { ok: true as const, generation: row };
    }

    const { getReplicatePrediction } = await import("./providers.server");
    let pred;
    try {
      pred = await getReplicatePrediction(charge.provider_job_id);
    } catch (e) {
      // Transient status-check failure: keep the job running, client will retry.
      return { ok: true as const, generation: row, transient: e instanceof Error ? e.message : "status check failed" };
    }

    if (pred.status === "succeeded" && pred.urls.length > 0) {
      const outputs = await persistOutputs(
        context.userId,
        data.id,
        pred.urls.map((url) => ({ url, mime: "video/mp4", label: "Video", demo: false })),
      );
      const { data: done } = await supabaseAdmin
        .from("generations")
        .update({ status: "succeeded", outputs, completed_at: new Date().toISOString() } as never)
        .eq("id", data.id)
        .select("*")
        .single();
      await markFinalized(data.id);
      return { ok: true as const, generation: done ?? row };
    }
    if (pred.status === "failed" || pred.status === "canceled" || pred.status === "succeeded") {
      const message = pred.error ? `Replicate: ${pred.error}` : "The video job did not complete.";
      const { data: failed } = await supabaseAdmin
        .from("generations")
        .update({ status: "failed", error: `${message} Site credits refunded.` } as never)
        .eq("id", data.id)
        .select("*")
        .single();
      await refundCharge(data.id);
      return { ok: true as const, generation: failed ?? row };
    }
    if (pred.status === "processing" && row.status === "queued") {
      await supabaseAdmin.from("generations").update({ status: "running" } as never).eq("id", data.id);
    }
    return { ok: true as const, generation: { ...row, provider_status: pred.status } };
  });

async function storeSourceImage(userId: string, generationId: string, dataUrl: string) {
  const match = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Invalid image data.");
  const mime = match[1]!;
  const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 3_500_000) throw new Error("Reference image is too large (max 3 MB).");
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/${generationId}/source.${ext}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const up = await supabaseAdmin.storage.from("generations").upload(path, bytes, { contentType: mime, upsert: true });
  if (up.error) throw new Error(`Could not store reference image: ${up.error.message}`);
  const signed = await supabaseAdmin.storage.from("generations").createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed.error || !signed.data) throw new Error("Could not prepare reference image.");
  return signed.data.signedUrl;
}

async function markFinalized(generationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("generation_charges" as never).update({ finalized: true } as never).eq("generation_id", generationId);
}

/** Refund exactly once: flip refunded=false→true atomically, then give credits back. */
async function refundCharge(generationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = (await supabaseAdmin
    .from("generation_charges" as never)
    .update({ refunded: true, finalized: true } as never)
    .eq("generation_id", generationId)
    .eq("refunded", false)
    .select("user_id, from_free, from_purchased, usage_date")
    .maybeSingle()) as { data: { user_id: string; from_free: number; from_purchased: number; usage_date: string } | null };
  if (!data) return;
  await refundSpend(data.user_id, { from_free: data.from_free, from_purchased: data.from_purchased }, data.usage_date);
}

export const getProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { providerConfig, replicateVideoConfigured } = await import("./providers.server");
  const image = providerConfig("image");
  const rv = replicateVideoConfigured();
  const video = rv ? { configured: true, name: "replicate" } : providerConfig("video");
  return {
    image: { configured: image.configured, name: image.name },
    video: { configured: video.configured, name: video.name },
  };
});

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        generationId: z.string().uuid().optional().nullable(),
        reason: z.string().min(2).max(120),
        details: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as SupabaseLike;
    const { error } = await supabase.from("reports").insert({
      reporter_id: context.userId,
      generation_id: data.generationId ?? null,
      reason: data.reason,
      details: data.details ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

async function refundSpend(
  userId: string,
  spend: { from_free?: number; from_purchased?: number },
  usageDate: string,
) {
  if (!spend.from_free && !spend.from_purchased) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("refund_credit_split" as never, {
      _user_id: userId,
      _from_free: spend.from_free ?? 0,
      _from_purchased: spend.from_purchased ?? 0,
      _usage_date: usageDate,
    } as never);
    if (error) console.error("Credit refund failed", error.message);
  } catch (e) {
    console.error("Credit refund failed", e);
  }
}

/** Provider URLs expire (~1h on Replicate); copy outputs into private storage with long-lived signed links. */
async function persistOutputs(
  userId: string,
  generationId: string,
  outputs: { url: string; mime: string; label: string; demo: boolean }[],
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return Promise.all(
    outputs.map(async (o, i) => {
      try {
        const res = await fetch(o.url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const mime = res.headers.get("content-type") ?? o.mime;
        const ext = mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "png";
        const path = `${userId}/${generationId}/${i + 1}.${ext}`;
        const buf = new Uint8Array(await res.arrayBuffer());
        const up = await supabaseAdmin.storage.from("generations").upload(path, buf, { contentType: mime, upsert: true });
        if (up.error) throw up.error;
        const signed = await supabaseAdmin.storage.from("generations").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signed.error || !signed.data) throw signed.error ?? new Error("sign failed");
        return { ...o, url: signed.data.signedUrl, mime };
      } catch (e) {
        console.error("Persisting output failed; keeping provider URL", e);
        return o;
      }
    }),
  );
}

type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => any;
};

function blockedByGate(g: { reason?: string; limit?: number }) {
  if (g.reason === "job_running") {
    return { ok: false as const, reason: "job_running" as const, message: "You already have a job running. Wait for it to finish before starting another." };
  }
  return {
    ok: false as const,
    reason: "daily_limit" as const,
    message: `Daily limit reached (${g.limit ?? 0} per day for this mode). It resets at midnight UTC.`,
  };
}

function providerFailure(error: unknown, message: string) {
  const billing = error instanceof Error && (error as { billing?: boolean }).billing === true;
  if (billing) {
    return {
      ok: false as const,
      reason: "provider_billing" as const,
      message:
        "The AI provider (Replicate) account is out of credit, so the job couldn't run. Your site credits were refunded. Site owner: add billing/credit at replicate.com/account/billing.",
    };
  }
  return { ok: false as const, reason: "provider_error" as const, message: `${message} Your site credits were refunded.` };
}
