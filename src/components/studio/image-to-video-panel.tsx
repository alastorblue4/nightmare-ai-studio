import { useServerFn } from "@tanstack/react-start";
import { Film, Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ResultCard } from "@/components/studio/result-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { checkVideoGeneration, createVideoGeneration } from "@/lib/generation.functions";
import { VIDEO_MODELS, VIDEO_QUALITIES, type Generation } from "@/lib/types";

const MAX_BYTES = 3_000_000;

export function ImageToVideoPanel({ onComplete }: { onComplete: () => void }) {
  const generate = useServerFn(createVideoGeneration);
  const check = useServerFn(checkVideoGeneration);
  const [phase, setPhase] = useState<string>("");
  const cancelled = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>(VIDEO_MODELS[0].value);
  const [quality, setQuality] = useState<string>("standard");
  const [duration, setDuration] = useState(5);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Generation[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { cancelled.current = true; if (timer.current) clearInterval(timer.current); }, []);

  async function pollUntilDone(id: string): Promise<Generation | null> {
    const started = Date.now();
    let failures = 0;
    while (!cancelled.current && Date.now() - started < 15 * 60_000) {
      await new Promise((r) => setTimeout(r, Date.now() - started < 30_000 ? 4000 : 8000));
      try {
        const res = await check({ data: { id } });
        if (!res.ok) throw new Error(res.message);
        failures = 0;
        const g = res.generation as unknown as Generation & { provider_status?: string };
        if (g.status === "succeeded" || g.status === "failed") return g;
        setPhase(g.provider_status === "starting" || g.status === "queued" ? "Queued at Replicate…" : "Processing video…");
      } catch {
        failures += 1;
        if (failures >= 5) throw new Error("Lost contact with the job. Check the Gallery in a minute — it keeps running.");
      }
    }
    return null;
  }

  function readFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That image is larger than 3 MB. Try a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!image) {
      toast.error("Upload a reference image first.");
      return;
    }
    setBusy(true);
    setPhase("Submitting job…");
    setProgress(4);
    timer.current = setInterval(() => setProgress((p) => Math.min(p + 1, 94)), 1500);
    try {
      const result = await generate({
        data: {
          prompt: prompt.trim(),
          model,
          aspectRatio: "16:9",
          quality: quality as "standard" | "high",
          durationSeconds: duration,
          sourceImageUrl: image,
        },
      });
      if (!result.ok) {
        if (result.reason === "insufficient_credits") {
          toast.error(`Not enough credits — this clip needs ${result.needed}, you have ${result.available}.`);
        } else {
          toast.error(result.message ?? "Generation failed");
        }
        return;
      }
      let generation = result.generation as unknown as Generation;
      onComplete();
      if (result.pending) {
        setPhase("Queued at Replicate…");
        const final = await pollUntilDone(generation.id);
        if (!final) {
          toast.message("Still rendering — it will appear in your Gallery when finished.");
          return;
        }
        generation = final;
      }
      setResults((prev) => [generation, ...prev]);
      if (generation.status === "failed") toast.error(generation.error ?? "Video failed. Credits refunded.");
      else toast.success(generation.is_demo ? "DEMO motion preview created" : "Video ready");
      onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      if (timer.current) clearInterval(timer.current);
      setProgress(100);
      setTimeout(() => setProgress(0), 600);
      setBusy(false);
      setPhase("");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="panel space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="video-upload">Reference image</Label>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a reference image"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) readFile(file);
            }}
            className={`relative flex min-h-40 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
              dragging ? "border-neon bg-neon/10" : "border-border bg-background/60 hover:border-primary"
            }`}
          >
            {image ? (
              <>
                <img src={image} alt="Reference" className="max-h-56 rounded-lg object-contain" />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute right-2 top-2 h-7 w-7"
                  aria-label="Remove image"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImage(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div>
                <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Drop an image or click to browse</p>
                <p className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 3 MB. Required.</p>
              </div>
            )}
            <input
              id="video-upload"
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) readFile(file);
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="motion">Motion instructions (optional)</Label>
          <Textarea
            id="motion"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Slow dolly forward through the fog, flickering neon, subtle camera shake"
            className="text-base"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-model">Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger id="video-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          Aspect ratio follows your reference image — crop the image first for 16:9, 9:16 or square.
        </p>

        <div className="space-y-2">
          <Label htmlFor="duration">Duration · {duration}s</Label>
          <Slider
            id="duration"
            min={5}
            max={7}
            step={1}
            value={[duration]}
            onValueChange={([value]) => setDuration(value ?? 5)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-quality">Quality</Label>
          <Select value={quality} onValueChange={setQuality}>
            <SelectTrigger id="video-quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_QUALITIES.map((q) => (
                <SelectItem key={q.value} value={q.value}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={busy}
          size="lg"
          className="w-full bg-neon font-semibold text-neon-foreground glow-neon hover:bg-neon/90"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
          {busy ? "Rendering…" : "Generate Video"}
        </Button>
        {progress > 0 ? <Progress value={progress} className="h-2" /> : null}
      </div>

      <div className="space-y-4">
        {busy ? (
          <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-neon" />
              <p className="mt-3 text-sm text-muted-foreground">{phase || "Animating frames…"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Videos usually take 1–3 minutes. You can leave — it will land in your Gallery.</p>
            </div>
          </div>
        ) : null}

        {!busy && results.length === 0 ? (
          <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Your clip and player appear here once a render finishes.
            </p>
          </div>
        ) : null}

        {results.map((generation) => (
          <ResultCard key={generation.id} generation={generation} onReuse={(g) => setPrompt(g.prompt)} />
        ))}
      </div>
    </div>
  );
}
