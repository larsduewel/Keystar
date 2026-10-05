import type { ReactNode } from "react";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { SecurityStatus } from "@/components/ui/security";
import { getI18n } from "@/i18n/server";
import type { FleetLayout } from "../logic";
import type { FleetMemberRow } from "../queries";

/**
 * Connector lines for one step of the tree: a vertical line down the left
 * gutter (stopping at the elbow on the last child) and a short horizontal
 * line into the node.
 */
const STEP =
  "relative pt-2 pl-6 before:absolute before:top-0 before:bottom-0 before:left-2.5 before:w-px before:bg-surface-contrast/15 last:before:bottom-auto last:before:h-6 after:absolute after:top-6 after:left-2.5 after:h-px after:w-3.5 after:bg-surface-contrast/15";

/** The fleet as a staircase: fleet command, then wings, then squads, then pilots, each one step further in. */
export async function FleetTree({ layout }: { layout: FleetLayout<FleetMemberRow> }) {
  const { t } = await getI18n();
  const fb = t.fleet.fallback;
  const tl = t.fleet.live.structure;

  const wingPilots = layout.wings.map((w) => w.commanders.length + w.squads.reduce((sum, s) => sum + s.members.length, 0));
  const wings = layout.wings.map((w, i) => {
    return (
      <Node key={w.id} title={w.name || fb.wing(w.id)} pilots={wingPilots[i]} members={w.commanders}>
        {w.squads.map((s) => {
          const commanders = s.members.filter((m) => m.role === "squad_commander");
          const rest = s.members.filter((m) => m.role !== "squad_commander");
          return (
            <Node key={s.id} title={s.name || fb.squad(s.id)} pilots={s.members.length} members={commanders}>
              {rest.map((m) => (
                <div key={m.characterId} className="glass-inset rounded-lg">
                  <PilotRow member={m} />
                </div>
              ))}
            </Node>
          );
        })}
      </Node>
    );
  });

  if (layout.command.length === 0) return <Steps root>{wings}</Steps>;
  const total = wingPilots.reduce((sum, n) => sum + n, layout.command.length);
  return (
    <Steps root>
      <Node title={tl.command} pilots={total} members={layout.command}>
        {wings}
      </Node>
    </Steps>
  );
}

function Steps({ children, root }: { children: ReactNode[] | ReactNode; root?: boolean }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <ul className={root ? "space-y-2" : undefined}>
      {items.map((child, i) => (
        <li key={i} className={root ? undefined : STEP}>
          {child}
        </li>
      ))}
    </ul>
  );
}

async function Node({ title, pilots, members, children }: { title: string; pilots: number; members: FleetMemberRow[]; children?: ReactNode }) {
  const { t } = await getI18n();
  return (
    <div>
      <div className="glass-inset rounded-lg">
        <div className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-1">
          <h3 className="eve-label truncate text-xs text-ink-2">{title}</h3>
          <span className="shrink-0 text-xs tabular-nums text-ink-3">{t.fleet.live.structure.pilots(pilots)}</span>
        </div>
        {members.length > 0 ? (
          <div className="border-t border-surface-contrast/5 pb-0.5">
            {members.map((m) => (
              <PilotRow key={m.characterId} member={m} showRole />
            ))}
          </div>
        ) : (
          <div className="pb-1.5" />
        )}
      </div>
      <Steps>{children}</Steps>
    </div>
  );
}

/** Ship, system and joined sit in fixed-width columns on the right so they line up across tree levels. */
async function PilotRow({ member: m, showRole }: { member: FleetMemberRow; showRole?: boolean }) {
  const { t, f } = await getI18n();
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Portrait id={m.characterId} size={22} />
        <span className="truncate">{m.name ?? t.fleet.fallback.character(m.characterId)}</span>
        {showRole && <span className="hidden truncate text-xs text-ink-3 md:inline">{t.fleet.roles[m.role] ?? m.role}</span>}
      </span>
      <span className="flex w-28 shrink-0 items-center gap-2 sm:w-36">
        <TypeIcon id={m.shipTypeId} size={20} />
        <span className="truncate text-ink-2">{m.shipName ?? t.fleet.fallback.type(m.shipTypeId)}</span>
      </span>
      <span className="hidden w-36 shrink-0 items-center gap-2 whitespace-nowrap md:flex">
        <SecurityStatus value={m.securityStatus} />
        <span className="truncate text-ink-2">{m.systemName ?? t.fleet.fallback.system}</span>
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs whitespace-nowrap text-ink-3 lg:block">{f.relativeTime(m.joinTime)}</span>
    </div>
  );
}
