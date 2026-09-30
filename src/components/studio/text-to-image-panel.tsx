import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ResultCard } from "@/components/studio/result-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createImageGeneration } from "@/lib/generation.functions";
import { ASPECT_RATIOS, IMAGE_MODELS, QUALITIES, type Generation } from "@/lib/types";

export function TextToImagePanel({
  onComplete,
  initialPrompt,
}: {
  onComplete: () => void;
  initialPrompt?: string | null | undefined;
}) {
  const generate = useServerFn(createImageGeneration);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [model, setModel] = useState<string>(IMAGE_MODELS[0].value);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [quality, setQuality] = useState<string>("standard");
  const [count, setCount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Generation[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Write a prompt first.");
      return;
    }
    setBusy(true);
    setProgress(8);
    timer.current = setInterval(() => setProgress((p) => Math.min(p + 7, 92)), 260);
    try {
      const result = await generate({
        data: {
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim() || null,
          model,
          aspectRatio: aspectRatio as "1:1" | "16:9" | "9:16",
          quality: quality as "standard" | "high" | "ultra",
          count: Number(count),
        },
      });
      if (!result.ok) {
        if (result.reason === "insufficient_credits") {
          toast.error(`Not enough credits — this job needs ${result.needed}, you have ${result.available}.`);
        } else {
          toast.error(result.message ?? "Generation failed");
        }
      } else {
        const generation = result.generation as unknown as Generation;
        setResults((prev) => [generation, ...prev]);
        toast.success(generation.is_demo ? "Demo placeholder created" : "Images ready");
      }
      onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      if (timer.current) clearInterval(timer.current);
      setProgress(100);
      setTimeout(() => setProgress(0), 600);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="panel space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A derelict neon arcade flooded with fog, purple rim light, cinematic 35mm"
            className="resize-y text-base"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="negative" className="text-muted-foreground">Negative prompt</Label>
          <Textarea
            id="negative"
            rows={2}
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="Not supported by the current FLUX models"
            disabled
            aria-describedby="negative-help"
          />
          <p id="negative-help" className="text-xs text-muted-foreground">
            FLUX models don't accept negative prompts. Describe what you want instead (e.g. "sharp, clean background").
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger id="model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Aspect ratio</Label>
          <ToggleGroup
            type="single"
            value={aspectRatio}
            onValueChange={(value) => value && setAspectRatio(value)}
            className="justify-start gap-2"
          >
            {ASPECT_RATIOS.map((ratio) => (
              <ToggleGroupItem
                key={ratio.value}
                value={ratio.value}
                aria-label={ratio.label}
                className="rounded-lg border border-border px-3 data-[state=on]:border-primary data-[state=on]:bg-primary/20"
              >
                {ratio.value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="quality">Quality</Label>
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger id="quality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITIES.map((q) => (
                  <SelectItem key={q.value} value={q.value}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="count">Images</Label>
            <Select value={count} onValueChange={setCount}>
              <SelectTrigger id="count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "3", "4"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={busy}
          size="lg"
          className="w-full bg-brand-gradient font-semibold text-primary-foreground glow-primary hover:opacity-90"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {busy ? "Generating…" : "Generate"}
        </Button>
        {progress > 0 ? <Progress value={progress} className="h-2" /> : null}
      </div>

      <div className="space-y-4">
        {busy ? (
          <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50">
            <div className="text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Rendering your frames…</p>
            </div>
          </div>
        ) : null}

        {!busy && results.length === 0 ? (
          <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Your results appear here. Write a prompt and hit Generate to fill this space.
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
