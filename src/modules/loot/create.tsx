"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/glass";
import { Button } from "@/components/ui/button";
import { createLootOperation } from "@/app/(app)/loot/actions";
export function CreateLoot({
  fleets,
}: {
  fleets: { id: number; name: string; preferred?: boolean }[];
}) {
  const { t } = useI18n(),
    m = t.loot,
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  return (
    <Panel title={m.create}>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError(false);
          try {
            const id = await createLootOperation({
              title: String(data.get("title")),
              start: new Date(String(data.get("start")) + "Z").toISOString(),
              end: new Date(String(data.get("end")) + "Z").toISOString(),
              fleetId: data.get("fleet") ? Number(data.get("fleet")) : null,
            });
            router.push(`/loot/${id}`);
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="text-xs">
          {m.name}
          <input
            required
            maxLength={100}
            name="title"
            className="mt-1 w-full rounded bg-space-700 p-2"
          />
        </label>
        <label className="text-xs">
          {m.start}
          <input
            required
            type="datetime-local"
            name="start"
            defaultValue={new Date().toISOString().slice(0, 10) + "T18:00"}
            className="mt-1 w-full rounded bg-space-700 p-2"
          />
        </label>
        <label className="text-xs">
          {m.end}
          <input
            required
            type="datetime-local"
            name="end"
            defaultValue={new Date().toISOString().slice(0, 10) + "T23:59"}
            className="mt-1 w-full rounded bg-space-700 p-2"
          />
        </label>
        <label className="text-xs">
          {m.fleet}
          <select
            name="fleet"
            defaultValue={fleets.find((f) => f.preferred)?.id ?? ""}
            key={fleets.find((f) => f.preferred)?.id ?? "none"}
            className="mt-1 w-full rounded bg-space-700 p-2"
          >
            <option value="">{m.none}</option>
            {fleets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={busy} variant="primary" className="self-end">
          {m.create}
        </Button>
        {error && (
          <p role="alert" className="text-xs text-critical-text sm:col-span-2">
            {m.error}
          </p>
        )}
      </form>
    </Panel>
  );
}
