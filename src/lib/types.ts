export type GenerationOutput = {
  url: string;
  mime: string;
  label: string;
  demo: boolean;
};

export type Generation = {
  id: string;
  user_id: string;
  kind: "image" | "video";
  status: "queued" | "running" | "succeeded" | "failed";
  prompt: string;
  negative_prompt: string | null;
  model: string | null;
  provider: string;
  aspect_ratio: string;
  quality: string;
  duration_seconds: number | null;
  output_count: number;
  credits_cost: number;
  is_demo: boolean;
  outputs: GenerationOutput[];
  source_image_url: string | null;
  error: string | null;
  provider_job_id?: string | null;
  created_at: string;
  completed_at: string | null;
};

export type CreditStatus = {
  unlimited: boolean;
  daily_free: number;
  used_today: number;
  free_remaining: number;
  purchased_credits: number;
  total_available: number;
};

export const ASPECT_RATIOS = [
  { value: "1:1", label: "Square 1:1" },
  { value: "16:9", label: "Wide 16:9" },
  { value: "9:16", label: "Vertical 9:16" },
] as const;

export const QUALITIES = [
  { value: "standard", label: "Standard · ~1MP, faster" },
  { value: "high", label: "High · ~1MP, more detail" },
  { value: "ultra", label: "Ultra · ~1MP, max detail (slowest)" },
] as const;

// Keys map to REPLICATE_IMAGE_MODELS in providers.server.ts.
export const IMAGE_MODELS = [
  { value: "flux-dev", label: "FLUX.1 [dev] · best quality (default)" },
  { value: "flux-schnell", label: "FLUX.1 [schnell] · fastest" },
] as const;

// Keys map to REPLICATE_VIDEO_MODELS in providers.server.ts.
export const VIDEO_MODELS = [{ value: "wan-2.2-i2v-fast", label: "Wan 2.2 Image→Video (fast)" }] as const;

export const VIDEO_QUALITIES = [
  { value: "standard", label: "Standard · 480p" },
  { value: "high", label: "High · 720p" },
] as const;

export function aspectClass(ratio: string) {
  if (ratio === "16:9") return "aspect-video";
  if (ratio === "9:16") return "aspect-[9/16]";
  return "aspect-square";
}
