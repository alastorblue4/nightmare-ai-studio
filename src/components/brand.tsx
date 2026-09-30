import { Link } from "@tanstack/react-router";

export function NightmareMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="nm-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.68 0.24 300)" />
          <stop offset="100%" stopColor="oklch(0.88 0.24 148)" />
        </linearGradient>
      </defs>
      <path
        d="M24 2 43 13v22L24 46 5 35V13Z"
        fill="none"
        stroke="url(#nm-mark)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M16 33V16l16 16V16" fill="none" stroke="url(#nm-mark)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none" aria-label="Nightmare AI home">
      <NightmareMark className={compact ? "h-7 w-7" : "h-9 w-9"} />
      <span className="font-display text-lg font-bold tracking-tight">
        <span className="text-brand-gradient">Nightmare</span> <span className="text-foreground">AI</span>
      </span>
    </Link>
  );
}
