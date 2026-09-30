import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRoles, useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

const links = [
  { to: "/dashboard", label: "Create" },
  { to: "/history", label: "Gallery" },
  { to: "/pricing", label: "Pricing" },
] as const;

export function SiteNav() {
  const { user, loading } = useSession();
  const { data: roleInfo } = useRoles(user?.id);
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.invalidate();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const nav = (
    <>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "text-foreground" }}
        >
          {link.label}
        </Link>
      ))}
      {roleInfo?.isStaff ? (
        <Link
          to="/admin"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-2 text-sm font-medium text-neon transition-colors hover:text-neon/80"
        >
          Admin
        </Link>
      ) : null}
    </>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <BrandLockup />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {nav}
        </nav>

        <div className="flex items-center gap-2">
          {loading ? null : user ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/account">Account</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Log in</Link>
              </Button>
              <Button asChild size="sm" className="bg-brand-gradient font-semibold text-primary-foreground glow-primary hover:opacity-90">
                <Link to="/auth" search={{ mode: "signup" }}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Start Creating
                </Link>
              </Button>
            </>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 bg-surface">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <nav className="mt-8 flex flex-col gap-1" aria-label="Mobile">
                {nav}
                {user ? (
                  <Link to="/account" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                    Account
                  </Link>
                ) : null}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
        <BrandLockup compact />
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Legal">
          <Link to="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/report" className="hover:text-foreground">
            Report content
          </Link>
        </nav>
        <p className="text-xs">© {new Date().getFullYear()} Nightmare AI. Create responsibly.</p>
      </div>
    </footer>
  );
}
