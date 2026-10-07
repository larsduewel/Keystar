"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { isWormholeSystem, matchSystems, wormholeClass, type SystemOption } from "@/core/eve/systems";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useKeepInViewport } from "./popover";
import { SecurityStatus } from "./security";

let systemsRequest: Promise<SystemOption[]> | null = null;

/** The system list, fetched once per page session and shared by every picker. */
function loadSystems(): Promise<SystemOption[]> {
  systemsRequest ??= fetch("/api/universe/systems")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<SystemOption[]>;
    })
    .catch((err) => {
      systemsRequest = null; // try again on the next focus
      throw err;
    });
  return systemsRequest;
}

/**
 * Solar system field with suggestions (known space and wormholes) that narrow
 * as you type. It stays a plain named input, so forms submit whatever was typed.
 */
export function SystemPicker({
  name,
  defaultValue = "",
  placeholder,
  className,
  onSelect,
  onValueChange,
  ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  onSelect?: (option: SystemOption) => void;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const s = t.common.systemPicker;
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [systems, setSystems] = useState<SystemOption[] | "loading" | "failed" | null>(null);

  const load = () => {
    if (Array.isArray(systems) || systems === "loading") return;
    setSystems("loading");
    loadSystems().then(setSystems, () => setSystems("failed"));
  };

  const matches = useMemo(() => (Array.isArray(systems) ? matchSystems(systems, value) : []), [systems, value]);
  const showList = open && value.trim().length > 0;
  const panelRef = useRef<HTMLDivElement>(null);
  useKeepInViewport(panelRef, showList);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (option: SystemOption) => {
    setValue(option[1]);
    onSelect?.(option);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showList) setOpen(true);
      else if (matches.length) {
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((i) => (i + step + matches.length) % matches.length);
      }
    } else if (e.key === "Enter" && showList && matches[active]) {
      // Take the highlighted system; a second Enter submits the form.
      if (matches[active][1] !== value) {
        e.preventDefault();
        pick(matches[active]);
      } else {
        onSelect?.(matches[active]);
        setOpen(false);
      }
    } else if (e.key === "Escape" && showList) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const wormholeTag = (region: string | null) => {
    const whClass = wormholeClass(region);
    return whClass ? s.wormholeClass[whClass] : s.wormhole;
  };

  const status =
    systems === "failed"
      ? s.failed
      : !Array.isArray(systems)
        ? s.loading
        : systems.length === 0
          ? s.empty
          : matches.length === 0
            ? s.noMatches
            : null;
  // The listbox only exists when there are suggestions; a status line stands in for it otherwise.
  const listOpen = showList && !status;

  return (
    <div className="relative">
      <input
        name={name}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listId : undefined}
        aria-activedescendant={listOpen && matches[active] ? `${listId}-${active}` : undefined}
        onFocus={load}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setValue(e.target.value);
          onValueChange?.(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={cn("glass-inset h-9 w-48 rounded-lg px-3 text-sm text-ink placeholder:text-ink-3", className)}
      />
      {showList && (
        <div ref={panelRef} className="absolute top-[calc(100%+6px)] left-0 z-50 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-surface-contrast/10 bg-space-800 p-1 shadow-2xl">
          {status ? (
            <p role="status" className="px-2 py-3 text-xs text-ink-3">
              {status}
            </p>
          ) : (
            <ul ref={listRef} id={listId} role="listbox" className="max-h-72 overflow-y-auto overscroll-contain">
              {matches.map((option, i) => (
                <li
                  key={option[0]}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  // Keep focus in the input so the click lands before blur closes the list.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(option)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-ink",
                    i === active && "bg-surface-contrast/8",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {option[1]}
                    {option[3] && <span className="ml-2 text-xs text-ink-3">{option[3]}</span>}
                  </span>
                  {isWormholeSystem(option[0]) ? (
                    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-semibold text-ink-2 ring-1 ring-surface-contrast/20">
                      {wormholeTag(option[3])}
                    </span>
                  ) : (
                    <SecurityStatus value={option[2]} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
