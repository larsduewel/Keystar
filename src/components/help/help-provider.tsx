"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { markVersionSeen } from "@/core/help/actions";
import type { Onboarding, WhatsNewDigest } from "@/core/help/onboarding";
import type { HelpData, HelpTopic } from "@/core/help/types";
import { HelpDialog, type HelpMode } from "./help-dialog";
import { WhatsNewDialog } from "./whats-new-dialog";

interface HelpContextValue {
  /** Opens the help, on `topic` or on "This page" (when the page has help). */
  openHelp: (topic?: HelpTopic) => void;
  openTour: () => void;
  /** Opens What's new for the newest release with highlights (`latest`). */
  openWhatsNew: () => void;
  latest: WhatsNewDigest | null;
  /** The running version. */
  current: string;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function useHelp(): HelpContextValue {
  const value = useContext(HelpContext);
  if (!value) throw new Error("useHelp needs a HelpProvider (the app layout)");
  return value;
}

/** Lets the shortcut skip keys typed into fields. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("input, textarea, select")));
}

/** Wait this long after the page appears before a dialog opens by itself, so it doesn't flash in with the page. */
const AUTO_OPEN_DELAY_MS = 500;
/** While another dialog is open (the user pressed ? first), try again this often. */
const AUTO_RETRY_MS = 1000;

/**
 * Hosts the help dialog (with the welcome tour) and the What's new dialog for the app shell:
 * the top bar's "?" button, the "?" key and the sidebar's version link open them, and the
 * layout's `auto` (src/core/help/onboarding.ts) opens one by itself once.
 */
export function HelpProvider({ data, auto, children }: { data: HelpData; auto: Onboarding; children: ReactNode }) {
  const helpRef = useRef<HTMLDialogElement>(null);
  const newsRef = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<HelpMode>(auto.kind === "welcome" ? "tour" : "browse");
  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const [step, setStep] = useState(0);
  const [digest, setDigest] = useState<WhatsNewDigest | null>(auto.kind === "whatsNew" ? auto.digest : data.latest);
  const opened = useRef(false);

  const show = useCallback((dialog: HTMLDialogElement | null) => {
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Start on the selected tab or step rather than the close button.
    dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
  }, []);

  const openHelp = useCallback(
    (next?: HelpTopic) => {
      newsRef.current?.close();
      flushSync(() => {
        setMode("browse");
        setTopic(next ?? null);
      });
      show(helpRef.current);
    },
    [show],
  );

  const openTour = useCallback(() => {
    newsRef.current?.close();
    flushSync(() => {
      setMode("tour");
      setStep(0);
    });
    show(helpRef.current);
  }, [show]);

  const openWhatsNew = useCallback(() => {
    if (!data.latest) return;
    helpRef.current?.close();
    flushSync(() => setDigest(data.latest));
    show(newsRef.current);
  }, [data.latest, show]);

  // Open the welcome tour or What's new once, and record the version either way.
  useEffect(() => {
    if (opened.current) return;
    if (auto.kind === "none") {
      if (auto.markSeen) {
        opened.current = true;
        void markVersionSeen().catch(() => undefined);
      }
      return;
    }
    const attempt = () => {
      if (opened.current) return;
      // Another dialog is open: wait until it is closed rather than dropping the tour or What's new.
      if (document.querySelector("dialog[open]")) {
        timer = setTimeout(attempt, AUTO_RETRY_MS);
        return;
      }
      opened.current = true;
      if (auto.kind === "welcome") openTour();
      else {
        flushSync(() => setDigest(auto.digest));
        show(newsRef.current);
      }
      void markVersionSeen().catch(() => undefined);
    };
    let timer = setTimeout(attempt, AUTO_OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [auto, openTour, show]);

  // "?" anywhere outside a field opens the help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.defaultPrevented || isTyping(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      openHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openHelp]);

  const value = useMemo(
    () => ({ openHelp, openTour, openWhatsNew, latest: data.latest, current: data.version }),
    [openHelp, openTour, openWhatsNew, data.latest, data.version],
  );

  return (
    <HelpContext.Provider value={value}>
      {children}
      <HelpDialog
        ref={helpRef}
        data={data}
        mode={mode}
        topic={topic}
        step={step}
        onTopic={setTopic}
        onStep={setStep}
        onTour={openTour}
        onWhatsNew={openWhatsNew}
        onClose={() => helpRef.current?.close()}
      />
      {digest && <WhatsNewDialog ref={newsRef} digest={digest} onClose={() => newsRef.current?.close()} />}
    </HelpContext.Provider>
  );
}
