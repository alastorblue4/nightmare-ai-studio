import { Download, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aspectClass, type Generation } from "@/lib/types";

function download(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function extensionFor(mime: string) {
  if (mime.includes("svg")) return "svg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("jpeg")) return "jpg";
  return "png";
}

export function ResultCard({
  generation,
  onReuse,
  onDelete,
}: {
  generation: Generation;
  onReuse?: (generation: Generation) => void;
  onDelete?: (generation: Generation) => void;
}) {
  const outputs = generation.outputs ?? [];

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Badge variant="outline" className={generation.kind === "video" ? "border-neon/40 text-neon" : "border-primary/40 text-primary"}>
          {generation.kind === "video" ? "Video" : "Image"}
        </Badge>
        {generation.is_demo ? (
          <Badge variant="outline" className="border-destructive/50 text-destructive">
            Demo placeholder — not AI generated
          </Badge>
        ) : (
          <Badge variant="outline">{generation.provider}</Badge>
        )}
        <Badge variant="secondary">{generation.aspect_ratio}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(generation.created_at).toLocaleString()}
        </span>
      </div>

      {generation.status === "failed" ? (
        <div className="p-4 text-sm text-destructive">Generation failed: {generation.error ?? "unknown error"}</div>
      ) : generation.status === "running" || generation.status === "queued" ? (
        <div className="p-4 text-sm text-muted-foreground" role="status">
          {generation.status === "queued" ? "Queued" : "Rendering"} at {generation.provider}… this card updates automatically.
        </div>
      ) : (
        <div className={`grid gap-2 p-3 ${outputs.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {outputs.map((output, index) => (
            <figure key={index} className={`overflow-hidden rounded-xl border border-border bg-background ${output.mime.startsWith("video/") ? "" : aspectClass(generation.aspect_ratio)}`}>
              {output.mime.startsWith("video/") ? (
                <video src={output.url} controls playsInline className="h-auto max-h-[70vh] w-full bg-background object-contain" />
              ) : (
                <img
                  src={output.url}
                  alt={`${generation.kind} result for prompt: ${generation.prompt.slice(0, 80)}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </figure>
          ))}
        </div>
      )}

      <div className="space-y-3 border-t border-border px-4 py-3">
        <p className="line-clamp-2 text-sm text-muted-foreground" title={generation.prompt}>
          {generation.prompt}
        </p>
        <div className="flex flex-wrap gap-2">
          {outputs.map((output, index) => (
            <Button
              key={index}
              size="sm"
              variant="outline"
              onClick={() =>
                download(output.url, `nightmare-ai-${generation.id.slice(0, 8)}-${index + 1}.${extensionFor(output.mime)}`)
              }
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {outputs.length > 1 ? `Save ${index + 1}` : "Save"}
            </Button>
          ))}
          {onReuse ? (
            <Button size="sm" variant="ghost" onClick={() => onReuse(generation)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reuse prompt
            </Button>
          ) : null}
          {onDelete ? (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(generation)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
