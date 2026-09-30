/**
 * Provider abstraction for Nightmare AI generation jobs.
 *
 * Real providers are configured purely through environment variables so a
 * hosted API *or* a self-hosted / local model endpoint can be connected later
 * without touching application code:
 *
 *   IMAGE_PROVIDER_NAME   e.g. "local-comfyui" | "replicate" | "fal"
 *   IMAGE_PROVIDER_URL    full HTTP endpoint that accepts the job payload
 *   IMAGE_PROVIDER_KEY    bearer token (optional for local endpoints)
 *
 *   VIDEO_PROVIDER_NAME
 *   VIDEO_PROVIDER_URL
 *   VIDEO_PROVIDER_KEY
 *
 * When no endpoint is configured the provider falls back to DEMO mode, which
 * returns clearly-labelled placeholder artwork. Demo output is never presented
 * as real AI generation.
 */

export type JobKind = "image" | "video";

export type ImageJob = {
  prompt: string;
  negativePrompt?: string | null;
  model?: string | null;
  aspectRatio: string;
  quality: string;
  count: number;
};

export type VideoJob = {
  prompt: string;
  model?: string | null;
  aspectRatio: string;
  quality: string;
  durationSeconds: number;
  sourceImageUrl?: string | null;
};

export type GeneratedOutput = {
  url: string;
  mime: string;
  label: string;
  demo: boolean;
};

export type ProviderResult = {
  provider: string;
  demo: boolean;
  outputs: GeneratedOutput[];
};

/**
 * Replicate text-to-image models. Change REPLICATE_IMAGE_MODELS / DEFAULT to
 * swap models. All listed models accept: prompt, aspect_ratio, num_outputs
 * (1–4), megapixels, num_inference_steps, output_format. None of the FLUX
 * models accept a negative prompt, so that control is disabled in the UI.
 */
export const REPLICATE_IMAGE_MODELS: Record<string, { id: string; maxSteps: number; steps: Record<string, number> }> = {
  "flux-dev": { id: "black-forest-labs/flux-dev", maxSteps: 50, steps: { standard: 20, high: 28, ultra: 40 } },
  "flux-schnell": { id: "black-forest-labs/flux-schnell", maxSteps: 4, steps: { standard: 4, high: 4, ultra: 4 } },
};
export const DEFAULT_REPLICATE_IMAGE_MODEL = "flux-dev";

function replicateEnv() {
  const lovableKey = process.env["LOVABLE_API_KEY"] ?? "";
  const connKey = process.env["REPLICATE_API_KEY"] ?? "";
  return { lovableKey, connKey, configured: Boolean(lovableKey && connKey) };
}

/** Priority: custom endpoint env vars > Replicate connector (images only) > demo. */
export function providerConfig(kind: JobKind) {
  const prefix = kind === "image" ? "IMAGE" : "VIDEO";
  const url = process.env[`${prefix}_PROVIDER_URL`] ?? "";
  const key = process.env[`${prefix}_PROVIDER_KEY`] ?? "";
  const name = process.env[`${prefix}_PROVIDER_NAME`] ?? "";
  if (url) return { url, key, name: name || "custom", configured: true, replicate: false };
  if (kind === "image" && replicateEnv().configured) {
    return { url: "", key: "", name: "replicate", configured: true, replicate: true };
  }
  return { url: "", key: "", name: "demo", configured: false, replicate: false };
}

const REPLICATE_GW = "https://connector-gateway.lovable.dev/replicate/v1";

export class ProviderError extends Error {}

async function runReplicateImage(job: ImageJob): Promise<GeneratedOutput[]> {
  const env = replicateEnv();
  const modelKey = job.model && REPLICATE_IMAGE_MODELS[job.model] ? job.model : DEFAULT_REPLICATE_IMAGE_MODEL;
  const model = REPLICATE_IMAGE_MODELS[modelKey]!;
  const headers = {
    Authorization: `Bearer ${env.lovableKey}`,
    "X-Connection-Api-Key": env.connKey,
    "Content-Type": "application/json",
  };
  const input = {
    prompt: job.prompt,
    aspect_ratio: job.aspectRatio,
    num_outputs: job.count,
    megapixels: "1",
    num_inference_steps: Math.min(model.steps[job.quality] ?? 20, model.maxSteps),
    output_format: "png",
    go_fast: true,
  };
  const res = await fetch(`${REPLICATE_GW}/models/${model.id}/predictions`, {
    method: "POST",
    headers: { ...headers, Prefer: "wait=55" },
    body: JSON.stringify({ input }),
  });
  if (res.status === 402) {
    throw new ProviderError("The connected Replicate account has no credit. Add billing at replicate.com/account/billing.");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Replicate create failed [${res.status}]: ${body}`);
    throw new ProviderError(`Replicate request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  let pred = (await res.json()) as { id: string; status: string; output?: unknown; error?: string | null };
  const started = Date.now();
  while (pred.status !== "succeeded" && pred.status !== "failed" && pred.status !== "canceled") {
    if (Date.now() - started > 120_000) throw new ProviderError("Replicate took too long to respond. Please try again.");
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`${REPLICATE_GW}/predictions/${pred.id}`, { headers });
    if (!poll.ok) {
      const body = await poll.text();
      throw new ProviderError(`Replicate status check failed (${poll.status}): ${body.slice(0, 200)}`);
    }
    pred = await poll.json();
  }
  if (pred.status !== "succeeded") {
    throw new ProviderError(pred.error ? `Replicate: ${String(pred.error).slice(0, 300)}` : "Replicate job did not complete.");
  }
  const urls = (Array.isArray(pred.output) ? pred.output : [pred.output]).filter((u): u is string => typeof u === "string");
  if (urls.length === 0) throw new ProviderError("Replicate returned no images.");
  return urls.map((url, i) => ({ url, mime: "image/png", label: `Image ${i + 1} · ${model.id}`, demo: false }));
}

export function dimensionsFor(aspectRatio: string, quality: string) {
  const base = quality === "ultra" ? 1536 : quality === "high" ? 1152 : 768;
  switch (aspectRatio) {
    case "16:9":
      return { width: base, height: Math.round((base * 9) / 16) };
    case "9:16":
      return { width: Math.round((base * 9) / 16), height: base };
    default:
      return { width: base, height: base };
  }
}

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function demoArtwork(opts: {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  animated: boolean;
  caption: string;
}) {
  const { prompt, width, height, seed, animated, caption } = opts;
  const hueA = seed % 360;
  const hueB = (hueA + 95) % 360;
  const words = escapeXml(prompt.slice(0, 90));
  const rings = Array.from({ length: 6 }, (_, i) => {
    const r = (Math.min(width, height) / 2.6) * (0.35 + i * 0.13);
    const dur = 6 + i;
    return `<circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="none" stroke="hsl(${(hueA + i * 18) % 360} 90% 65% / 0.35)" stroke-width="${1 + (i % 3)}">${
      animated
        ? `<animate attributeName="r" values="${r};${r * 1.12};${r}" dur="${dur}s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.25;0.9;0.25" dur="${dur}s" repeatCount="indefinite" />`
        : ""
    }</circle>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${words}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="hsl(${hueA} 85% 22%)"/>
<stop offset="55%" stop-color="hsl(${hueB} 70% 12%)"/>
<stop offset="100%" stop-color="#08070c"/>
</linearGradient>
</defs>
<rect width="100%" height="100%" fill="url(#g)"/>
${rings}
<rect x="0" y="${height - Math.max(74, height * 0.16)}" width="100%" height="${Math.max(74, height * 0.16)}" fill="#05040a" fill-opacity="0.72"/>
<text x="24" y="${height - Math.max(74, height * 0.16) + 30}" fill="#9dffbe" font-family="monospace" font-size="${Math.max(13, width * 0.018)}">${escapeXml(caption)}</text>
<text x="24" y="${height - 22}" fill="#e7e2ff" font-family="monospace" font-size="${Math.max(12, width * 0.016)}">${words}</text>
</svg>`;
  return svgDataUri(svg);
}

async function callRemote(url: string, key: string, payload: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["authorization"] = `Bearer ${key}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    throw new Error(`Provider responded with ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as { outputs?: { url: string; mime?: string }[]; url?: string };
}

export async function runImageJob(job: ImageJob): Promise<ProviderResult> {
  const cfg = providerConfig("image");
  const { width, height } = dimensionsFor(job.aspectRatio, job.quality);

  if (cfg.configured) {
    const data = await callRemote(cfg.url, cfg.key, {
      type: "text-to-image",
      prompt: job.prompt,
      negative_prompt: job.negativePrompt ?? "",
      model: job.model ?? undefined,
      width,
      height,
      num_outputs: job.count,
    });
    const list = data.outputs ?? (data.url ? [{ url: data.url }] : []);
    if (list.length === 0) throw new Error("Provider returned no images");
    return {
      provider: cfg.name,
      demo: false,
      outputs: list.map((o, i) => ({
        url: o.url,
        mime: o.mime ?? "image/png",
        label: `Image ${i + 1}`,
        demo: false,
      })),
    };
  }

  return {
    provider: "demo",
    demo: true,
    outputs: Array.from({ length: job.count }, (_, i) => ({
      url: demoArtwork({
        prompt: job.prompt,
        width,
        height,
        seed: hash(`${job.prompt}|${job.negativePrompt ?? ""}|${i}`),
        animated: false,
        caption: "DEMO PLACEHOLDER — no AI provider configured",
      }),
      mime: "image/svg+xml",
      label: `Demo image ${i + 1}`,
      demo: true,
    })),
  };
}

export async function runVideoJob(job: VideoJob): Promise<ProviderResult> {
  const cfg = providerConfig("video");
  const { width, height } = dimensionsFor(job.aspectRatio, job.quality);

  if (cfg.configured) {
    const data = await callRemote(cfg.url, cfg.key, {
      type: "image-to-video",
      prompt: job.prompt,
      model: job.model ?? undefined,
      image: job.sourceImageUrl ?? undefined,
      width,
      height,
      duration_seconds: job.durationSeconds,
    });
    const list = data.outputs ?? (data.url ? [{ url: data.url }] : []);
    if (list.length === 0) throw new Error("Provider returned no video");
    return {
      provider: cfg.name,
      demo: false,
      outputs: list.map((o) => ({
        url: o.url,
        mime: o.mime ?? "video/mp4",
        label: "Video",
        demo: false,
      })),
    };
  }

  return {
    provider: "demo",
    demo: true,
    outputs: [
      {
        url: demoArtwork({
          prompt: job.prompt,
          width,
          height,
          seed: hash(`${job.prompt}|video`),
          animated: true,
          caption: `DEMO MOTION PREVIEW · ${job.durationSeconds}s — no AI provider configured`,
        }),
        mime: "image/svg+xml",
        label: "Demo motion preview",
        demo: true,
      },
    ],
  };
}

/** Minimal abuse-prevention hook. Extend with a real moderation provider. */
const BLOCKED = [
  "child sexual",
  "csam",
  "child porn",
  "underage nude",
  "bomb making instructions",
  "how to make a bomb",
];

export function moderatePrompt(prompt: string): { allowed: boolean; reason?: string } {
  const value = prompt.toLowerCase();
  const hit = BLOCKED.find((term) => value.includes(term));
  if (hit) {
    return { allowed: false, reason: "This prompt violates the Nightmare AI content policy." };
  }
  if (prompt.trim().length < 3) {
    return { allowed: false, reason: "Please write a longer prompt." };
  }
  return { allowed: true };
}
