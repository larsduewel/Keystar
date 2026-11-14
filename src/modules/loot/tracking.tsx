"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startFleetTracking } from "@/app/(app)/fleet/actions";
import { useI18n } from "@/i18n/client";
import { Panel } from "@/components/ui/glass";
import { Button } from "@/components/ui/button";
export function LootTracking({
  characters,
  trackers,
}: {
  characters: { characterId: number; name: string }[];
  trackers: {
    characterId: number;
    status: "tracking" | "not_boss" | "no_fleet" | "stopped";
  }[];
}) {
  const { t } = useI18n(),
    m = t.loot,
    router = useRouter();
  const [characterId, setCharacterId] = useState(
      characters[0]?.characterId ?? 0,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    if (
      !trackers.some((t) => t.status === "tracking" || t.status === "not_boss")
    )
      return;
    const timer = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(timer);
  }, [trackers, router]);
  const tracker = trackers.find((t) => t.characterId === characterId);
  return (
    <Panel title={m.startTracking}>
      <p className="mb-3 text-xs text-ink-3">{m.trackingHint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={m.participant}
          className="rounded bg-space-700 p-2 text-sm"
          value={characterId}
          onChange={(e) => setCharacterId(Number(e.target.value))}
        >
          {characters.map((c) => (
            <option value={c.characterId} key={c.characterId}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          disabled={busy || !characterId}
          onClick={async () => {
            setBusy(true);
            setError(false);
            try {
              const result = await startFleetTracking(characterId);
              if (!result.ok) setError(true);
              router.refresh();
            } catch {
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {m.startTracking}
        </Button>
        <Link className="text-sm text-accent" href="/fleet">
          {m.trackingSetup}
        </Link>
        {tracker && (
          <span className="text-xs text-ink-3">{m[tracker.status]}</span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-warn-text">
          {m.trackingHint}
        </p>
      )}
    </Panel>
  );
}
