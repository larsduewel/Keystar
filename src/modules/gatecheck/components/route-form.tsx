"use client";

import { Route } from "lucide-react";
import Form from "next/form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SystemPicker } from "@/components/ui/system-picker";
import { useI18n } from "@/i18n/client";
import type { GatecheckQuery } from "../params";
import { PREFERENCES, type RoutePreference } from "../route";

const field = "glass-inset h-9 rounded-lg px-3 text-sm text-ink";

/** The route form. A GET form: the check lives in the URL, so reloading or sharing it checks again. */
export function RouteForm({ query }: { query: GatecheckQuery }) {
  const { t } = useI18n();
  const s = t.gatecheck.form;
  const [preference, setPreference] = useState<RoutePreference>(query.preference);
  return (
    <Form action="/gatecheck">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          {s.from}
          <SystemPicker name="from" defaultValue={query.from} placeholder={s.fromPlaceholder} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-3">
          {s.to}
          <SystemPicker name="to" defaultValue={query.to} placeholder={s.toPlaceholder} />
        </label>
        <div className="flex flex-col gap-1 text-xs text-ink-3">
          <span>{s.preference}</span>
          <Segmented
            label={s.preference}
            value={preference}
            onChange={setPreference}
            options={PREFERENCES.map((p) => ({
              value: p,
              label: s.preferences[p],
              title: s.preferenceHints[p],
            }))}
          />
          <input type="hidden" name="pref" value={preference} />
        </div>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-ink-3">
          {s.avoid}
          <input
            name="avoid"
            defaultValue={query.avoid}
            placeholder={s.avoidPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className={field}
          />
        </label>
        <Button type="submit" variant="primary">
          <Route className="size-4" aria-hidden />
          {s.submit}
        </Button>
      </div>
    </Form>
  );
}
