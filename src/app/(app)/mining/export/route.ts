import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/core/audit";
import { getCurrentUser } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { csvCell } from "@/modules/mining/csv";
import { parseMiningFilters } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { getLedgerRows, miningScope, type LedgerRow } from "@/modules/mining/queries";

/** Rows fetched per database round-trip while streaming. */
const PAGE_SIZE = 5_000;

const HEADER = [
  "date",
  "source",
  "character_id",
  "character",
  "main",
  "type_id",
  "ore",
  "class",
  "system_id",
  "system",
  "security",
  "refinery",
  "quantity",
  "volume_m3",
  "unit_price_isk",
  "value_isk",
];

function csvLine(r: LedgerRow): string {
  return [
    r.date,
    r.source,
    r.characterId,
    r.characterName,
    r.ownerName,
    r.typeId,
    r.typeName,
    r.oreClass,
    r.systemId,
    r.systemName,
    r.security === null ? null : r.security.toFixed(2),
    r.observerName,
    r.quantity,
    r.volume.toFixed(2),
    r.unitPrice.toFixed(2),
    r.value.toFixed(2),
  ]
    .map(csvCell)
    .join(",");
}

/**
 * CSV download of the complete ledger with the same filters and data scope as
 * the UI. Rows are streamed page by page, so large exports are never truncated
 * and never held in memory at once.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.can(MINING_PERMISSIONS.export) || !user.canAny(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filters = parseMiningFilters(Object.fromEntries(request.nextUrl.searchParams));
  const settings = await getSettings();
  const scope = miningScope(user, settings["corp.homeCorporationId"]);
  const valuation = { source: settings["mining.valuationSource"], mode: settings["mining.valuationMode"] };

  // One count up front for the audit log; the stream itself pages until empty.
  const { total } = await getLedgerRows(filters, scope, valuation, { limit: 0, offset: 0 });
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "mining.export",
    details: { from: filters.from, to: filters.to, rows: total },
  });

  const encoder = new TextEncoder();
  let offset = 0;
  let headerSent = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!headerSent) {
          headerSent = true;
          controller.enqueue(encoder.encode(HEADER.join(",") + "\n"));
        }
        const { rows } = await getLedgerRows(filters, scope, valuation, { limit: PAGE_SIZE, offset, count: false });
        if (rows.length) controller.enqueue(encoder.encode(rows.map(csvLine).join("\n") + "\n"));
        offset += rows.length;
        if (rows.length < PAGE_SIZE) controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keystar-mining-${filters.from}_${filters.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
