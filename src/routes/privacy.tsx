import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter, SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice — Nightmare AI" },
      { name: "description", content: "What Nightmare AI stores about your account and your generations." },
      { property: "og:title", content: "Nightmare AI Privacy Notice" },
      { property: "og:description", content: "How account data, prompts and generations are handled." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold">Privacy Notice</h1>
        <p className="text-sm text-muted-foreground">
          Placeholder text. Replace with a notice reviewed by your own legal advisor before launch.
        </p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">What we store</h2>
          <p className="text-muted-foreground">
            Your email address, display name, credit balance, daily credit usage, and every generation job you
            create — including the prompt, settings and output.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Who can see it</h2>
          <p className="text-muted-foreground">
            Only you, plus the site owner and admins for moderation and support. Access is enforced by database
            access rules, not just by the interface.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Third-party generation providers</h2>
          <p className="text-muted-foreground">
            If the owner connects an external generation provider, prompts and reference images are sent to that
            provider to fulfil your request. When no provider is connected, nothing leaves this application.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Deleting your data</h2>
          <p className="text-muted-foreground">
            You can delete individual generations from your gallery at any time. Contact the site owner to
            request full account deletion.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
