"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import {
  updateLootOperation,
  importLootOperation,
  type LootCommand,
} from "@/app/(app)/loot/actions";
import { settlement } from "./model";
import type { Ledger, LootItem } from "./types";
type Operation = {
  id: string;
  title: string;
  ownerId: string;
  ledger: Ledger;
  revision: number;
  startsAt: string;
  endsAt: string;
  shared: boolean;
  closed: boolean;
  syncStatus: "pending" | "ready" | "failed";
  syncedAt: string | null;
};
const field = "mt-1 w-full rounded bg-space-700 p-2 text-xs";
const number = (form: FormData, key: string) => Number(form.get(key));
const nullable = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim() === "" ? null : number(form, key);
export function LootWorkspace({
  operation: op,
  owner,
  trackers = [],
}: {
  operation: Operation;
  owner: boolean;
  trackers?: { characterId: number; name: string }[];
}) {
  const { t, f } = useI18n(),
    m = t.loot,
    router = useRouter();
  const [tab, setTab] = useState<
      "loot" | "participants" | "kills" | "settlement"
    >("loot"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [paste, setPaste] = useState("");
  const [importError, setImportError] = useState<{
    code: keyof typeof m.importErrors;
    line?: number;
  } | null>(null);
  const ledger = op.ledger,
    totals = settlement(ledger),
    disabled = busy || !owner || op.closed;
  useEffect(() => {
    if (op.syncStatus !== "pending") return;
    const timer = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(timer);
  }, [op.syncStatus, router]);
  async function run(command: LootCommand) {
    setBusy(true);
    setError(false);
    setImportError(null);
    try {
      if (command.kind === "import") {
        const result = await importLootOperation(op.id, op.revision, command);
        if (!result.ok) {
          setImportError(result);
          router.refresh();
          return;
        }
      } else await updateLootOperation(op.id, op.revision, command);
      router.refresh();
    } catch {
      setError(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  const submit =
    (make: (form: FormData) => LootCommand) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void run(make(new FormData(event.currentTarget)));
    };
  const exportCsv = () => {
    const rows = [
      [
        m.item,
        m.quantity,
        m.collector,
        m.status,
        m.price,
        m.snapshot,
        m.proceeds,
        m.match,
      ],
      ...ledger.items.map((i) => [
        i.name,
        i.quantity,
        i.collector,
        m[i.status],
        i.price ?? "",
        i.pricedAt ?? "",
        i.proceeds ?? "",
        m[i.match],
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(value)
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""')}"`,
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleet-loot-${op.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <Link href="/loot" className="text-sm text-accent">
        {m.back}
      </Link>
      <PageHeader
        eyebrow={m.title}
        title={op.title}
        description={`${f.dateTime(op.startsAt)} – ${f.dateTime(op.endsAt)} · ${op.closed ? m.closed : m.open}`}
        actions={
          <>
            <Button onClick={() => router.refresh()}>{m.refresh}</Button>
            <Button onClick={exportCsv}>{m.download}</Button>
            {owner && (
              <>
                <Button
                  disabled={busy || op.closed}
                  onClick={() => run({ kind: "sync" })}
                >
                  {m.sync}
                </Button>
                <Button
                  disabled={busy || op.syncStatus === "pending"}
                  onClick={() => run({ kind: "close", closed: !op.closed })}
                >
                  {op.closed ? m.reopen : m.close}
                </Button>
              </>
            )}
          </>
        }
      />
      <p
        role="status"
        className={`text-xs ${op.syncStatus === "failed" ? "text-warn-text" : "text-ink-3"}`}
      >
        {m[op.syncStatus]}
        {op.syncedAt && ` · ${f.dateTime(op.syncedAt)}`}
      </p>
      {!owner && <p className="text-sm text-ink-3">{m.readOnly}</p>}
      {error && (
        <p role="alert" className="text-sm text-critical-text">
          {m.error}
        </p>
      )}
      {importError && (
        <p role="alert" className="text-sm text-critical-text">
          {m.importErrors[importError.code]}
          {importError.line ? ` (${importError.line})` : ""}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={m.estimate} value={f.isk(totals.estimated)} />
        <StatTile label={m.sales} value={f.isk(totals.sales)} />
        <StatTile label={m.pool} value={f.isk(totals.distributable)} />
        <StatTile label={m.missing} value={f.number(totals.missing)} />
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {(["loot", "participants", "kills", "settlement"] as const).map(
          (key) => (
            <Button
              key={key}
              role="tab"
              aria-selected={tab === key}
              variant={tab === key ? "primary" : "glass"}
              onClick={() => setTab(key)}
            >
              {m[key]}
              {key === "participants" ? ` (${ledger.participants.length})` : ""}
            </Button>
          ),
        )}
      </div>
      {tab === "loot" && (
        <div className="space-y-4">
          {owner && !op.closed && (
            <Panel title={m.import}>
              <p className="mb-3 text-xs text-ink-3">{m.importHint}</p>
              <form
                onSubmit={submit((form) => ({
                  kind: "import",
                  text: paste,
                  day: String(form.get("day")),
                  collector: String(form.get("collector")),
                }))}
              >
                <fieldset disabled={disabled} className="space-y-3">
                  <label className="block max-w-md text-xs">
                    {m.lootDate}
                    <input
                      required
                      type="date"
                      name="day"
                      defaultValue={op.startsAt.slice(0, 10)}
                      className={field}
                    />
                    <span className="text-ink-3">{m.lootDateHint}</span>
                  </label>
                  <label className="block max-w-md text-xs">
                    {m.collector}
                    <input name="collector" maxLength={100} className={field} />
                  </label>
                  <label className="block text-xs">
                    {m.upload}
                    <input
                      type="file"
                      accept=".txt,.tsv,.csv"
                      className="ml-2 text-xs"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 200000) {
                          setError(true);
                          return;
                        }
                        setPaste(await file.text());
                      }}
                    />
                  </label>
                  <label className="block text-xs">
                    {m.paste}
                    <textarea
                      required
                      value={paste}
                      onChange={(e) => setPaste(e.target.value)}
                      maxLength={200000}
                      rows={5}
                      className={field}
                    />
                  </label>
                  <Button variant="primary">{m.import}</Button>
                </fieldset>
              </form>
              <p className="mt-3 text-xs text-ink-3">{m.duplicateHint}</p>
            </Panel>
          )}
          <Panel title={m.loot}>
            <p className="mb-3 text-xs text-ink-3">{m.priceHint}</p>
            {!ledger.items.length && (
              <p className="text-sm text-ink-3">{m.noItems}</p>
            )}
            <div className="space-y-2">
              {ledger.items.map((item) => (
                <details
                  key={item.id}
                  className="rounded-lg border border-line p-3"
                >
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {f.number(item.quantity)} × {item.name}
                      <span className="ml-2 text-xs text-ink-3">
                        {item.collector}
                        {item.time ? ` · ${f.dateTime(item.time)}` : ""}
                      </span>
                    </span>
                    <span>
                      {item.price === null
                        ? m.unknown
                        : f.isk(item.price * item.quantity)}{" "}
                      · {m[item.status]} · {m[item.match]}
                    </span>
                  </summary>
                  <form
                    key={`${item.id}:${op.revision}`}
                    onSubmit={submit((form) => ({
                      kind: "item",
                      id: item.id,
                      status: String(form.get("status")) as LootItem["status"],
                      price: nullable(form, "price"),
                      proceeds: nullable(form, "proceeds"),
                      retainedBy: String(form.get("retainedBy")) || null,
                      killmailId: nullable(form, "killmailId"),
                      match: String(form.get("match")) as LootItem["match"],
                    }))}
                  >
                    <fieldset
                      disabled={disabled}
                      className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      <label className="text-xs">
                        {m.status}
                        <select
                          name="status"
                          defaultValue={item.status}
                          className={field}
                        >
                          {(
                            [
                              "collected",
                              "handed",
                              "sold",
                              "retained",
                              "excluded",
                            ] as const
                          ).map((s) => (
                            <option value={s} key={s}>
                              {m[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        {m.price}
                        <input
                          type="number"
                          name="price"
                          min={0}
                          step="0.01"
                          defaultValue={item.price ?? ""}
                          className={field}
                        />
                        <span className="text-ink-3">
                          {m.snapshot}:{" "}
                          {item.pricedAt
                            ? f.dateTime(item.pricedAt)
                            : m.unknown}
                        </span>
                      </label>
                      <label className="text-xs">
                        {m.proceeds}
                        <input
                          type="number"
                          name="proceeds"
                          min={0}
                          step="0.01"
                          defaultValue={item.proceeds ?? ""}
                          className={field}
                        />
                      </label>
                      <label className="text-xs">
                        {m.retainedBy}
                        <select
                          name="retainedBy"
                          defaultValue={item.retainedBy ?? ""}
                          className={field}
                        >
                          <option value="">{m.none}</option>
                          {ledger.participants.map((p) => (
                            <option value={p.id} key={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        {m.match}
                        <select
                          name="match"
                          defaultValue={item.match}
                          className={field}
                        >
                          {(
                            [
                              "unmatched",
                              "possible",
                              "confirmed",
                              "disputed",
                            ] as const
                          ).map((s) => (
                            <option value={s} key={s}>
                              {m[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        {m.kills}
                        <select
                          name="killmailId"
                          defaultValue={item.killmailId ?? ""}
                          className={field}
                        >
                          <option value="">{m.none}</option>
                          {ledger.kills.map((k) => (
                            <option value={k.id} key={k.id}>
                              {k.id}
                              {item.candidates.includes(k.id)
                                ? ` · ${m.possible}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button className="self-end">{m.save}</Button>
                    </fieldset>
                  </form>
                </details>
              ))}
            </div>
          </Panel>
        </div>
      )}
      {tab === "participants" && (
        <Panel title={m.participants}>
          <p className="mb-3 text-xs text-ink-3">{m.eligibilityHint}</p>
          {owner && (
            <div className="mb-3 flex flex-wrap gap-2">
              {trackers.map((tr) => (
                <Button
                  disabled={disabled}
                  key={tr.characterId}
                  onClick={() =>
                    run({ kind: "linkFleet", characterId: tr.characterId })
                  }
                >
                  {m.linkFleet} · {tr.name}
                </Button>
              ))}
              <Link href="/fleet" className="self-center text-xs text-accent">
                {m.trackingSetup}
              </Link>
            </div>
          )}
          <p className="mb-3 text-xs text-ink-3">{m.attendanceHint}</p>
          <div className="mb-4 flex flex-wrap gap-3">
            {totals.shares.map((p) => (
              <div className="glass-chip rounded-lg p-3 text-sm" key={p.name}>
                <span className="block text-xs text-ink-3">
                  {p.name} · {m.recalculated}
                </span>
                <strong>{f.isk(p.entitlement)}</strong>
              </div>
            ))}
          </div>
          {owner && !op.closed && (
            <form
              className="mb-4"
              onSubmit={submit((form) => ({
                kind: "participant",
                name: String(form.get("name")),
                payee: String(form.get("payee")),
                weight: number(form, "weight"),
              }))}
            >
              <fieldset
                disabled={disabled}
                className="grid gap-2 sm:grid-cols-4"
              >
                <label className="text-xs">
                  {m.participant}
                  <input
                    required
                    name="name"
                    maxLength={100}
                    className={field}
                  />
                </label>
                <label className="text-xs">
                  {m.payee}
                  <input name="payee" maxLength={100} className={field} />
                </label>
                <label className="text-xs">
                  {m.weight}
                  <input
                    name="weight"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={1}
                    step="0.01"
                    className={field}
                  />
                </label>
                <Button className="self-end">{m.add}</Button>
              </fieldset>
            </form>
          )}
          <div className="space-y-3">
            {ledger.participants.map((p) => (
              <form
                key={`${p.id}:${op.revision}`}
                onSubmit={submit((form) => ({
                  kind: "participantEdit",
                  id: p.id,
                  payee: String(form.get("payee")),
                  weight: number(form, "weight"),
                  paid: number(form, "paid"),
                }))}
              >
                <fieldset
                  disabled={disabled}
                  className="grid items-end gap-2 rounded-lg border border-line p-3 sm:grid-cols-5"
                >
                  <div className="text-sm">
                    {p.name}
                    <label className="my-1 flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={p.eligible !== false}
                        onChange={(event) =>
                          run({
                            kind: "eligibility",
                            id: p.id,
                            eligible: event.target.checked,
                          })
                        }
                      />
                      {m.eligible}
                    </label>
                    <span className="block text-xs text-ink-3">
                      {p.characterId ?? m.unknown}
                    </span>
                  </div>
                  <label className="text-xs">
                    {m.payee}
                    <input
                      required
                      name="payee"
                      defaultValue={p.payee}
                      maxLength={100}
                      className={field}
                    />
                  </label>
                  <label className="text-xs">
                    {m.weight}
                    <input
                      name="weight"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      defaultValue={p.weight}
                      className={field}
                    />
                  </label>
                  <label className="text-xs">
                    {m.paid}
                    <input
                      name="paid"
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={p.paid}
                      className={field}
                    />
                  </label>
                  <Button>{m.save}</Button>
                </fieldset>
              </form>
            ))}
          </div>
        </Panel>
      )}
      {tab === "kills" && (
        <Panel title={m.kills}>
          <p className="mb-3 text-xs text-ink-3">{m.killHint}</p>
          <form
            onSubmit={submit((form) => {
              const input = String(form.get("ids"));
              const ids = [
                ...input.matchAll(/(?:zkillboard\.com\/kill\/)?(\d{6,})/g),
              ].map((m) => Number(m[1]));
              return { kind: "killmails", ids };
            })}
          >
            <fieldset disabled={disabled} className="flex gap-2">
              <input
                name="ids"
                required
                aria-label={m.killIds}
                placeholder={m.killIds}
                className={field}
              />
              <Button>{m.add}</Button>
            </fieldset>
          </form>
          <div className="mt-4 space-y-2">
            {ledger.killIds.map((id) => {
              const k = ledger.kills.find((k) => k.id === id);
              return (
                <div
                  key={id}
                  className="flex flex-wrap justify-between gap-2 rounded border border-line p-2 text-sm"
                >
                  <a
                    className="text-accent"
                    href={`https://zkillboard.com/kill/${id}/`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {id}
                  </a>
                  <span>
                    {k
                      ? `${f.dateTime(k.time)} · ${k.items.length} ${m.item}`
                      : m.unknown}
                  </span>
                  {owner && (
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => run({ kind: "removeKill", id })}
                    >
                      {m.remove}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}
      {tab === "settlement" && (
        <div className="space-y-4">
          <Panel title={m.settings}>
            <form
              key={op.revision}
              onSubmit={submit((form) => ({
                kind: "settings",
                basis: String(form.get("basis")) as "estimate" | "sales",
                expenses: number(form, "expenses"),
                splitMode: String(form.get("splitMode")) as "equal" | "atLoot",
                corpPercent: number(form, "corpPercent"),
                shared: form.get("shared") === "on",
              }))}
            >
              <fieldset
                disabled={disabled}
                className="grid gap-3 sm:grid-cols-3"
              >
                <label className="text-xs">
                  {m.splitMode}
                  <select
                    name="splitMode"
                    defaultValue={ledger.splitMode ?? "equal"}
                    className={field}
                  >
                    <option value="equal">{m.equal}</option>
                    <option value="atLoot">{m.atLoot}</option>
                  </select>
                </label>
                <label className="text-xs">
                  {m.basis}
                  <select
                    name="basis"
                    defaultValue={ledger.basis}
                    className={field}
                  >
                    <option value="estimate">{m.estimate}</option>
                    <option value="sales">{m.sales}</option>
                  </select>
                </label>
                <label className="text-xs">
                  {m.expenses}
                  <input
                    name="expenses"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={ledger.expenses}
                    className={field}
                  />
                </label>
                <label className="text-xs">
                  {m.corpPercent}
                  <input
                    name="corpPercent"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    defaultValue={ledger.corpPercent}
                    className={field}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs sm:col-span-2">
                  <input
                    name="shared"
                    type="checkbox"
                    defaultChecked={op.shared}
                  />
                  {m.shared}
                </label>
                <Button>{m.save}</Button>
              </fieldset>
            </form>
          </Panel>
          <Panel title={m.settlement}>
            <p className="mb-3 text-xs text-ink-3">{m.splitHint}</p>
            <p className="mb-3 text-xs text-ink-3">{m.atLootHint}</p>
            {(totals.missing > 0 ||
              totals.shortfall > 0 ||
              totals.unallocated > 0) && (
              <p className="mb-3 text-sm text-warn-text">{m.provisional}</p>
            )}
            <p className="mb-3 text-sm">
              {m.unallocated}: {f.isk(totals.unallocated)} · {m.corp}:{" "}
              {f.isk(totals.corp)} · {m.shortfall}: {f.isk(totals.shortfall)}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {[
                      m.payee,
                      m.entitlement,
                      m.retainedValue,
                      m.paid,
                      m.balance,
                    ].map((label) => (
                      <th key={label} className="p-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {totals.shares.map((p) => (
                    <tr key={p.name} className="border-t border-line">
                      <td className="p-2">
                        {p.name}
                        <span className="block text-ink-3">
                          {p.characters.join(", ")}
                        </span>
                      </td>
                      <td className="p-2">{f.isk(p.entitlement)}</td>
                      <td className="p-2">{f.isk(p.retained)}</td>
                      <td className="p-2">{f.isk(p.paid)}</td>
                      <td
                        className={`p-2 ${p.balance < 0 ? "text-warn-text" : ""}`}
                      >
                        {f.isk(p.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
      <details className="text-xs text-ink-3">
        <summary className="cursor-pointer">{m.audit}</summary>
        {ledger.audit
          .slice(-15)
          .reverse()
          .map((entry, i) => (
            <p key={i}>
              {f.dateTime(entry.at)} · {entry.action}
            </p>
          ))}
      </details>
    </div>
  );
}
