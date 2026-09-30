import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter, SiteNav } from "@/components/site-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { adjustUserCredits, getAdminOverview, saveSetting, setUserRole, updateReportStatus } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Nightmare AI" },
      { name: "description", content: "Nightmare AI admin dashboard." },
      { property: "og:title", content: "Admin — Nightmare AI" },
      { property: "og:description", content: "Manage users, credits, providers and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getAdminOverview);
  const adjust = useServerFn(adjustUserCredits);
  const setRole = useServerFn(setUserRole);
  const save = useServerFn(saveSetting);
  const setReport = useServerFn(updateReportStatus);
  const q = useQuery({ queryKey: ["admin"], queryFn: () => fetchOverview(), retry: false });

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <h1 className="font-display text-3xl font-bold">Admin</h1>
        {q.isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : q.error || !q.data ? (
          <p className="panel rounded-2xl p-6 text-destructive">You don't have access to the admin dashboard.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Object.entries(q.data.stats).map(([k, v]) => (
                <div key={k} className="panel rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.replace(/_/g, " ")}</p>
                  <p className="font-display text-2xl font-bold">{String(v)}</p>
                </div>
              ))}
            </div>
            <Tabs defaultValue="users">
              <TabsList className="flex-wrap">
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="jobs">Jobs</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="reports">Reports</TabsTrigger>
              </TabsList>
              <TabsContent value="users" className="mt-4 space-y-2">
                {q.data.users.map((u) => {
                  const r = q.data.userRoles.filter((x) => x.user_id === u.id).map((x) => x.role);
                  return (
                    <UserRow
                      key={u.id}
                      email={u.email ?? u.id}
                      credits={u.purchased_credits}
                      roles={r}
                      canManageRoles={q.data.roles.includes("owner")}
                      onAdjust={(delta) => run(() => adjust({ data: { userId: u.id, delta } }), "Credits updated")}
                      onToggleAdmin={() => run(() => setRole({ data: { userId: u.id, role: "admin", enabled: !r.includes("admin") } }), "Role updated")}
                    />
                  );
                })}
              </TabsContent>
              <TabsContent value="jobs" className="mt-4 space-y-2">
                {q.data.jobs.length === 0 && <p className="text-muted-foreground">No jobs yet.</p>}
                {q.data.jobs.map((j) => (
                  <div key={j.id} className="panel flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
                    <Badge variant="outline">{j.kind}</Badge>
                    <Badge variant={j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge>
                    {j.is_demo && <Badge variant="outline">demo</Badge>}
                    <span className="flex-1 truncate">{j.prompt}</span>
                    <span className="text-muted-foreground">{new Date(j.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="settings" className="mt-4 space-y-4">
                {q.data.settings.map((s) => (
                  <SettingEditor key={s.key} name={s.key} value={s.value} onSave={(v) => run(() => save({ data: { key: s.key, value: v } }), "Setting saved")} />
                ))}
              </TabsContent>
              <TabsContent value="reports" className="mt-4 space-y-2">
                {q.data.reports.length === 0 && <p className="text-muted-foreground">No reports.</p>}
                {q.data.reports.map((r) => (
                  <div key={r.id} className="panel space-y-2 rounded-xl p-3 text-sm">
                    <div className="flex items-center gap-2"><Badge>{r.status}</Badge><span className="font-semibold">{r.reason}</span></div>
                    {r.details && <p className="text-muted-foreground">{r.details}</p>}
                    <div className="flex gap-2">
                      {(["reviewing", "resolved", "dismissed"] as const).map((st) => (
                        <Button key={st} size="sm" variant="outline" onClick={() => run(() => setReport({ data: { id: r.id, status: st } }), "Report updated")}>{st}</Button>
                      ))}
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function UserRow(props: { email: string; credits: number; roles: string[]; canManageRoles: boolean; onAdjust: (d: number) => void; onToggleAdmin: () => void }) {
  const [delta, setDelta] = useState("10");
  return (
    <div className="panel flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{props.email}</span>
      {props.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
      <span className="text-muted-foreground">{props.credits} purchased</span>
      <Input aria-label="Credit change" className="w-20" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
      <Button size="sm" onClick={() => props.onAdjust(parseInt(delta, 10) || 0)}>Apply</Button>
      {props.canManageRoles && !props.roles.includes("owner") && (
        <Button size="sm" variant="outline" onClick={props.onToggleAdmin}>{props.roles.includes("admin") ? "Remove admin" : "Make admin"}</Button>
      )}
    </div>
  );
}

function SettingEditor({ name, value, onSave }: { name: string; value: unknown; onSave: (v: Record<string, unknown>) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  return (
    <div className="panel space-y-2 rounded-2xl p-4">
      <p className="font-display font-semibold capitalize">{name}</p>
      <Textarea className="font-mono text-xs" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      <Button
        size="sm"
        onClick={() => {
          try {
            onSave(JSON.parse(text));
          } catch {
            toast.error("Invalid JSON");
          }
        }}
      >
        Save
      </Button>
    </div>
  );
}
