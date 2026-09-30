import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { submitReport } from "@/lib/generation.functions";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report content — Nightmare AI" },
      { name: "description", content: "Report a generation or account that breaks the Nightmare AI content policy." },
      { property: "og:title", content: "Report content on Nightmare AI" },
      { property: "og:description", content: "Flag policy-violating generations for review." },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { user, loading } = useSession();
  const send = useServerFn(submitReport);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await send({
        data: {
          reason,
          details: details || null,
          generationId: generationId.trim() ? generationId.trim() : null,
        },
      });
      setDone(true);
      toast.success("Report received. Thank you.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <Card className="panel border-0">
          <CardHeader>
            <CardTitle className="text-2xl">Report content</CardTitle>
            <CardDescription>
              Flag anything that breaks the content policy. Reports go straight to the moderation queue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !user ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">You need to be signed in to submit a report.</p>
                <Button asChild>
                  <Link to="/auth">Sign in</Link>
                </Button>
              </div>
            ) : done ? (
              <div className="rounded-xl border border-neon/30 bg-neon/10 p-4 text-sm">
                <p className="font-medium text-neon">Report submitted</p>
                <p className="mt-1 text-muted-foreground">A moderator will review it shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reason">What is wrong?</Label>
                  <Input
                    id="reason"
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Harassment, illegal content, impersonation"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="generationId">Generation ID (optional)</Label>
                  <Input
                    id="generationId"
                    value={generationId}
                    onChange={(e) => setGenerationId(e.target.value)}
                    placeholder="Copy it from the gallery"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="details">Details (optional)</Label>
                  <Textarea
                    id="details"
                    rows={5}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Anything that helps a moderator understand the issue"
                  />
                </div>
                <Button type="submit" disabled={busy} className="bg-brand-gradient font-semibold text-primary-foreground">
                  {busy ? "Sending…" : "Submit report"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
