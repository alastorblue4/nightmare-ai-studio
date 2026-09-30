import { Link } from "@tanstack/react-router";
import { Infinity as InfinityIcon, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreditStatus } from "@/lib/types";

export function CreditsBar({
  status,
  costs,
  loading,
}: {
  status?: CreditStatus;
  costs?: { image_cost: number; video_cost: number };
  loading?: boolean;
}) {
  if (loading || !status) {
    return <Skeleton className="h-20 w-full rounded-2xl" />;
  }

  if (status.unlimited) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neon/30 bg-neon/10 p-4">
        <div className="flex items-center gap-3">
          <InfinityIcon className="h-5 w-5 text-neon" />
          <div>
            <p className="font-semibold text-neon">Unlimited credits</p>
            <p className="text-sm text-muted-foreground">Owner and admin accounts are never charged.</p>
          </div>
        </div>
      </div>
    );
  }

  const pct = status.daily_free > 0 ? (status.free_remaining / status.daily_free) * 100 : 0;
  const empty = status.total_available <= 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Zap className={`h-5 w-5 ${empty ? "text-destructive" : "text-neon"}`} />
          <div>
            <p className="font-semibold">
              {status.free_remaining} / {status.daily_free} free credits left today
            </p>
            <p className="text-sm text-muted-foreground">
              {status.purchased_credits} purchased credits
              {costs ? ` · image ${costs.image_cost} · video ${costs.video_cost}` : ""}
            </p>
          </div>
        </div>
        <Button asChild variant={empty ? "default" : "outline"} size="sm">
          <Link to="/pricing">{empty ? "Get more credits" : "Buy credits"}</Link>
        </Button>
      </div>
      <Progress value={pct} className="mt-3 h-2" />
      {empty ? (
        <p className="mt-3 text-sm text-destructive">
          You are out of credits. Your free allowance resets tomorrow, or you can top up on the pricing page.
        </p>
      ) : null}
    </div>
  );
}
