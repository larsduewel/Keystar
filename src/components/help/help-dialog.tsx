"use client";

import { ArrowLeft, ArrowRight, Check, CircleHelp, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent, type Ref } from "react";
import { KeystarMark } from "@/components/shell/logo";
import { matchNavItem } from "@/components/shell/nav-match";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import type { HelpData, HelpTopic } from "@/core/help/types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { isPlainClick } from "./clicks";
import { AccessTopic, BasicsTopic, DataTopic, Kbd, PageTopic, ScopesTopic, StartStep, WelcomeStep } from "./help-topics";

export type HelpMode = "browse" | "tour";

const TOPICS: readonly HelpTopic[] = ["page", "basics", "scopes", "data", "access"];
/** The welcome tour: the topics in order, between a welcome and a "get started" step. */
export const TOUR_STEPS = ["welcome", "basics", "scopes", "data", "access", "start"] as const;
type Shown = HelpTopic | (typeof TOUR_STEPS)[number];

const NAV_KEYS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/**
 * The help: topics in a side list (tabs), or the welcome tour through the same topics with
 * Back and Next. "This page" explains the sidebar page the viewer is on.
 */
export function HelpDialog({
  ref,
  data,
  mode,
  topic,
  step,
  onTopic,
  onStep,
  onTour,
  onWhatsNew,
  onClose,
}: {
  ref: Ref<HTMLDialogElement>;
  data: HelpData;
  mode: HelpMode;
  /** null: "This page" when the page has help, else "How Keystar works". */
  topic: HelpTopic | null;
  step: number;
  onTopic: (topic: HelpTopic) => void;
  onStep: (step: number) => void;
  onTour: () => void;
  onWhatsNew: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const h = t.help;
  const pathname = usePathname();
  const id = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const tour = mode === "tour";
  // "This page": the sidebar page the path belongs to (the longest matching href, nested pages included).
  const row = matchNavItem(pathname, data.access);
  const current: HelpTopic = topic ?? (row ? "page" : "basics");
  const stepIndex = Math.min(step, TOUR_STEPS.length - 1);
  const shown: Shown = tour ? TOUR_STEPS[stepIndex]! : current;
  const last = stepIndex === TOUR_STEPS.length - 1;
  const headingId = `${id}heading`;
  const tabId = (key: HelpTopic) => `${id}tab-${key}`;
  const label = (key: Shown) => (key === "welcome" ? h.tour.welcome : key === "start" ? h.tour.start : h.topics[key]);

  const navRef = useRef<HTMLOListElement>(null);
  // A new topic or step starts at the top, and the step list (a row on phones) shows the current step.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    navRef.current?.querySelector("[aria-current=step]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [shown]);

  const goTo = (next: number) => {
    onStep(next);
    // The tour moves focus to the new step's heading, like a page change.
    requestAnimationFrame(() => document.getElementById(headingId)?.focus());
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TOPICS.indexOf(current);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? TOPICS.length - 1 : e.key in NAV_KEYS ? (i + NAV_KEYS[e.key]! + TOPICS.length) % TOPICS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    onTopic(TOPICS[next]!);
    document.getElementById(tabId(TOPICS[next]!))?.focus();
  };

  // Links inside close the dialog: the layout stays mounted while the page changes below it.
  const closeOnLink = (e: MouseEvent<HTMLDivElement>) => {
    if (isPlainClick(e) && (e.target as HTMLElement).closest("[data-close-dialog]")) onClose();
  };

  const navClass =
    "flex shrink-0 gap-1 overflow-x-auto border-b border-surface-contrast/[0.075] px-4 py-2 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-4";
  const itemClass = (selected: boolean) =>
    cn(
      "flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors md:whitespace-normal",
      selected ? "bg-surface-contrast/[0.08] text-ink" : "text-ink-2 hover:bg-surface-contrast/[0.04] hover:text-ink",
    );

  return (
    <Dialog
      ref={ref}
      size="lg"
      icon={tour ? <KeystarMark className="size-7" /> : <CircleHelp className="size-5" aria-hidden />}
      title={tour ? h.tour.title : h.title}
      intro={tour ? h.tour.intro : h.intro}
      closeLabel={h.close}
      footer={
        tour ? (
          <DialogFooter>
            <span className="text-xs text-ink-3 tabular-nums">{h.tour.progress(stepIndex + 1, TOUR_STEPS.length)}</span>
            {!last && (
              <form method="dialog">
                <Button type="submit" variant="ghost" size="sm">
                  {h.tour.skip}
                </Button>
              </form>
            )}
            <div className="ml-auto flex gap-2">
              {stepIndex > 0 && (
                <Button type="button" size="sm" onClick={() => goTo(stepIndex - 1)}>
                  <ArrowLeft className="size-3.5" aria-hidden /> {h.tour.back}
                </Button>
              )}
              {last ? (
                <form method="dialog">
                  <Button type="submit" variant="primary" size="sm">
                    <Check className="size-3.5" aria-hidden /> {h.tour.finish}
                  </Button>
                </form>
              ) : (
                <Button type="button" variant="primary" size="sm" onClick={() => goTo(stepIndex + 1)} data-initial-focus>
                  {h.tour.next} <ArrowRight className="size-3.5" aria-hidden />
                </Button>
              )}
            </div>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <span className="font-mono text-3xs text-ink-3">{h.version(data.version)}</span>
            <span className="hidden text-xs text-ink-3 sm:inline">{h.shortcut(<Kbd>?</Kbd>)}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {data.latest && (
                <Button type="button" size="sm" onClick={onWhatsNew}>
                  <Sparkles className="size-3.5" aria-hidden /> {h.whatsNew(data.latest.version)}
                </Button>
              )}
              <Button type="button" size="sm" onClick={onTour}>
                {h.takeTour}
              </Button>
            </div>
          </DialogFooter>
        )
      }
    >
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:h-[min(600px,calc(100dvh-15rem))] md:flex-auto md:grid-cols-[210px_minmax(0,1fr)] md:grid-rows-1">
        {tour ? (
          <ol ref={navRef} aria-label={h.tour.stepsLabel} className={navClass}>
            {TOUR_STEPS.map((key, i) => (
              <li key={key} className="shrink-0">
                <button
                  type="button"
                  aria-current={i === stepIndex ? "step" : undefined}
                  onClick={() => goTo(i)}
                  className={cn(itemClass(i === stepIndex), "w-full")}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full font-mono text-3xs ring-1 ring-inset",
                      i < stepIndex ? "bg-good/18 text-good-text ring-good/35" : "bg-accent/12 text-accent ring-accent/30",
                    )}
                  >
                    {i < stepIndex ? <Check className="size-3" /> : i + 1}
                  </span>
                  {label(key)}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div role="tablist" aria-label={h.topicsLabel} aria-orientation="vertical" onKeyDown={onTabKey} className={navClass}>
            {TOPICS.map((key) => {
              const selected = key === current;
              return (
                <button
                  key={key}
                  id={tabId(key)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${id}panel`}
                  tabIndex={selected ? 0 : -1}
                  data-initial-focus={selected || undefined}
                  onClick={() => onTopic(key)}
                  className={itemClass(selected)}
                >
                  {label(key)}
                </button>
              );
            })}
          </div>
        )}
        <div
          ref={contentRef}
          id={`${id}panel`}
          role={tour ? undefined : "tabpanel"}
          aria-labelledby={tour ? undefined : tabId(current)}
          onClick={closeOnLink}
          className="min-h-0 overflow-y-auto overscroll-contain px-6 py-5"
        >
          {shown === "welcome" && <WelcomeStep data={data} headingId={headingId} />}
          {shown === "page" && <PageTopic data={data} row={row} pathname={pathname} headingId={headingId} />}
          {shown === "basics" && <BasicsTopic data={data} headingId={headingId} />}
          {shown === "scopes" && <ScopesTopic data={data} headingId={headingId} />}
          {shown === "data" && <DataTopic data={data} headingId={headingId} />}
          {shown === "access" && <AccessTopic data={data} headingId={headingId} />}
          {shown === "start" && <StartStep data={data} headingId={headingId} onWhatsNew={onWhatsNew} />}
        </div>
      </div>
    </Dialog>
  );
}
