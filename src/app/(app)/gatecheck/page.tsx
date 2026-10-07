import { Route } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { AutoRefresh } from "@/modules/fleet/components/auto-refresh";
import { RouteForm } from "@/modules/gatecheck/components/route-form";
import { FeedLine, RouteSummary, RouteSystems } from "@/modules/gatecheck/components/route-result";
import { GATECHECK_PERMISSIONS } from "@/modules/gatecheck/module";
import { gatecheckHref, parseQuery } from "@/modules/gatecheck/params";
import { runGatecheck } from "@/modules/gatecheck/service";
import { findSystem } from "@/modules/gatecheck/universe";
import { getUniverse } from "@/modules/gatecheck/universe-data";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.gatecheck.page.title };
}

/** Re-check the route every minute while the tab is open (it only reads the database). */
const REFRESH_SECONDS = 60;

export default async function GatecheckPage({ searchParams }: PageProps<"/gatecheck">) {
  await requirePermission(GATECHECK_PERMISSIONS.use);
  const { t, f } = await getI18n();
  const g = t.gatecheck;
  const query = parseQuery(await searchParams);
  const asked = !!(query.from && query.to);
  const result = asked ? await runGatecheck(query) : null;
  const errors: string[] = [];
  if (asked && result === null) {
    // runGatecheck returns null only when a system is unknown; name the one(s) it didn't find.
    if (!findSystem(getUniverse(), query.from)) errors.push(g.errors.unknownFrom(query.from));
    if (!findSystem(getUniverse(), query.to)) errors.push(g.errors.unknownTo(query.to));
  }
  if (result?.resolved.unknownAvoid.length) errors.push(g.errors.unknownAvoid(result.resolved.unknownAvoid));
  if (result && !result.route) errors.push(g.errors.noRoute);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={t.killboard.module.navSection} title={g.page.title} description={g.page.description} />
      <Panel className="z-10">
        <RouteForm key={gatecheckHref(query)} query={query} />
      </Panel>
      {errors.length > 0 && (
        <div role="alert" className="space-y-1 text-sm text-warning">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      {result?.route ? (
        <>
          <AutoRefresh seconds={REFRESH_SECONDS} />
          <FeedLine feed={result.feed} t={g} f={f} now={result.now} />
          <RouteSummary result={result} query={query} t={g} f={f} />
          <RouteSystems result={result} query={query} t={g} f={f} />
        </>
      ) : (
        !asked && (
          <Panel>
            <EmptyState icon={Route} title={g.empty.title}>
              {g.empty.body}
            </EmptyState>
          </Panel>
        )
      )}
      <p className="text-xs text-ink-3">{g.hint}</p>
    </div>
  );
}
