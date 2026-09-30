import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type OAuthResult = { data: { redirect_url?: string; redirect_to?: string; client?: { name?: string } } | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  head: () => ({
    meta: [
      { title: "Authorize access — Nightmare AI" },
      { name: "description", content: "Approve or deny an app connecting to your Nightmare AI account." },
      { property: "og:title", content: "Authorize access — Nightmare AI" },
      { property: "og:description", content: "Connect an AI assistant to your Nightmare AI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <p className="panel rounded-2xl p-6">Could not load this authorization request: {(error as Error)?.message ?? String(error)}</p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name ?? "An app";

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect returned by the authorization server."); return; }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero p-6">
      <div className="panel w-full max-w-md space-y-5 rounded-2xl p-8">
        <BrandLockup />
        <h1 className="font-display text-2xl font-bold">Connect {name} to your account</h1>
        <p className="text-muted-foreground">
          {name} will be able to view your generations and credit balance on Nightmare AI as you.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1">Approve</Button>
          <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">Deny</Button>
        </div>
      </div>
    </main>
  );
}
