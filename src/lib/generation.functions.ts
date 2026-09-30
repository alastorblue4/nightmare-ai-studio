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
});

const videoSchema = z.object({
  prompt: z.string().min(1).max(2000),
  model: z.string().max(120).optional().nullable(),
  aspectRatio: z.enum(["1:1", "16:9", "9:16"]),
  quality: z.enum(["standard", "high", "ultra"]),
  durationSeconds: z.number().int().min(2).max(12),
  sourceImageUrl: z.string().max(5_000_000).optional().nullable(),
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
    const check = moderatePrompt(data.prompt);
    if (!check.allowed) return { ok: false as const, reason: "blocked", message: check.reason };

    const supabase = context.supabase as never as SupabaseLike;
    const costs = await readCosts(supabase as never);
    const cost = costs.image_cost * data.count;

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
    const { data: row, error: insertError } = await supabase
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
      const { data: done, error: updateError } = await supabase
        .from("generations")
        .update({
          status: "succeeded",
          outputs: result.outputs,
          provider: result.provider,
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
      await supabase.from("generations").update({ status: "failed", error: message }).eq("id", row.id);
      await refundSpend(context.userId, spendResult, usageDate);
      return { ok: false as const, reason: "provider_error", message: `${message} Your credits were refunded.` };
    }
  });

export const createVideoGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => videoSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { moderatePrompt, runVideoJob, providerConfig } = await import("./providers.server");
    const check = moderatePrompt(data.prompt);
    if (!check.allowed) return { ok: false as const, reason: "blocked", message: check.reason };

    const supabase = context.supabase as never as SupabaseLike;
    const costs = await readCosts(supabase as never);
    const cost = costs.video_cost;

    const { data: spend, error: spendError } = await supabase.rpc("consume_credits", { _cost: cost });
    if (spendError) throw new Error(spendError.message);
    const spendResult = spend as { ok: boolean; available?: number; from_free?: number; from_purchased?: number };
    const usageDate = new Date().toISOString().slice(0, 10);
    if (!spendResult.ok) {
      return { ok: false as const, reason: "insufficient_credits", needed: cost, available: spendResult.available ?? 0 };
    }

    const cfg = providerConfig("video");
    const { data: row, error: insertError } = await supabase
      .from("generations")
      .insert({
        user_id: context.userId,
        kind: "video",
        status: "running",
        prompt: data.prompt,
        model: data.model ?? null,
        provider: cfg.name,
        aspect_ratio: data.aspectRatio,
        quality: data.quality,
        duration_seconds: data.durationSeconds,
        output_count: 1,
        credits_cost: cost,
        is_demo: !cfg.configured,
        source_image_url: data.sourceImageUrl ?? null,
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);

    try {
      const result = await runVideoJob({
        prompt: data.prompt,
        model: data.model ?? null,
        aspectRatio: data.aspectRatio,
        quality: data.quality,
        durationSeconds: data.durationSeconds,
        sourceImageUrl: data.sourceImageUrl ?? null,
      });
      const { data: done, error: updateError } = await supabase
        .from("generations")
        .update({
          status: "succeeded",
          outputs: result.outputs,
          provider: result.provider,
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
      await supabase.from("generations").update({ status: "failed", error: message }).eq("id", row.id);
      await refundSpend(context.userId, spendResult, usageDate);
      return { ok: false as const, reason: "provider_error", message: `${message} Your credits were refunded.` };
    }
  });

export const getProviderStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { providerConfig } = await import("./providers.server");
  const image = providerConfig("image");
  const video = providerConfig("video");
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
