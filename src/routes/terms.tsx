import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter, SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Nightmare AI" },
      { name: "description", content: "The rules for using the Nightmare AI generation studio." },
      { property: "og:title", content: "Nightmare AI Terms of Use" },
      { property: "og:description", content: "Acceptable use, credits and account rules for Nightmare AI." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold">Terms of Use</h1>
        <p className="text-sm text-muted-foreground">
          Placeholder text. Replace with terms reviewed by your own legal advisor before launch.
        </p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">1. Your account</h2>
          <p className="text-muted-foreground">
            You are responsible for activity on your account and for keeping your credentials secure. Accounts
            receive a daily allowance of generation credits, which resets each day.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2. Acceptable use</h2>
          <p className="text-muted-foreground">
            Nightmare AI must not be used to create sexual content involving minors, non-consensual intimate
            imagery, targeted harassment, disinformation designed to deceive, or anything illegal in your
            jurisdiction. Prompts are screened and generations can be reviewed following a report.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">2a. Mature Content (18+)</h2>
          <p className="text-muted-foreground">
            Adults who confirm they are 18 or older may turn on Mature Content in their account. It is off by
            default and covers non-explicit adult themes only (for example romance, pin-up styles or revealing
            outfits), subject to the AI provider's own rules. Mature generations are private to your account and
            labelled 18+. The following are always prohibited: explicit sexual or pornographic content; any
            sexual or suggestive content involving minors or young-looking persons; non-consensual sexual
            content; illegal content; and attempts to bypass site or provider safety filters. Violations can be
            reported and may lead to removal and account suspension.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">3. Credits and payments</h2>
          <p className="text-muted-foreground">
            Credits are consumed when a generation job is accepted. Paid credit packs only become purchasable
            once a payment provider is connected; until then no payments are processed.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">4. Generated output</h2>
          <p className="text-muted-foreground">
            You are responsible for how you use output. When no generation provider is connected, the studio
            returns clearly labelled demo placeholders, which are not AI-generated artwork.
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">5. Termination</h2>
          <p className="text-muted-foreground">
            Accounts that break these rules may be suspended and their generations removed.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
