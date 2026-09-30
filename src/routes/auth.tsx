import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ mode: z.enum(["login", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Nightmare AI" },
      { name: "description", content: "Create a Nightmare AI account or sign in to start generating." },
      { property: "og:title", content: "Sign in to Nightmare AI" },
      { property: "og:description", content: "Create an account and claim 5 free generation credits a day." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentConfirmation, setSentConfirmation] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSentConfirmation(true);
          toast.success("Check your email to confirm your account.");
        } else {
          toast.success("Welcome to Nightmare AI");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-hero">
      <div className="mx-auto flex w-full max-w-7xl items-center px-4 py-6 sm:px-6">
        <BrandLockup />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4">
        <Card className="panel w-full max-w-md border-0">
          <CardHeader>
            <CardTitle className="text-2xl">{isSignUp ? "Create your account" : "Welcome back"}</CardTitle>
            <CardDescription>
              {isSignUp
                ? "5 free generation credits every day, reset daily."
                : "Sign in to keep creating with Nightmare AI."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sentConfirmation ? (
              <div className="rounded-xl border border-neon/30 bg-neon/10 p-4 text-sm">
                <p className="font-medium text-neon">Confirm your email</p>
                <p className="mt-1 text-muted-foreground">
                  We sent a confirmation link to {email}. Click it, then come back and sign in.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => setSentConfirmation(false)}>
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isSignUp ? (
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display name</Label>
                      <Input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Nightcrawler"
                        autoComplete="nickname"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      placeholder="••••••••"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full bg-brand-gradient font-semibold text-primary-foreground glow-primary hover:opacity-90"
                  >
                    {busy ? "Working…" : isSignUp ? "Create account" : "Sign in"}
                  </Button>
                </form>

                <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
                </div>

                <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy}>
                  Continue with Google
                </Button>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  {isSignUp ? "Already have an account?" : "New to Nightmare AI?"}{" "}
                  <button
                    type="button"
                    className="font-medium text-neon underline-offset-4 hover:underline"
                    onClick={() => setIsSignUp((v) => !v)}
                  >
                    {isSignUp ? "Sign in" : "Create one"}
                  </button>
                </p>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  By continuing you agree to the{" "}
                  <Link to="/terms" className="underline">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="underline">
                    Privacy notice
                  </Link>
                  .
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
