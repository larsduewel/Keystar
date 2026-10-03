"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** How long the fade-out takes before the toast is removed. */
const LEAVE_MS = 300;

const noSubscription = () => () => {};

/** Where `ToastViewport`s render when a `ToastProvider` is mounted, so every toast shares one stack. */
const SlotContext = createContext<HTMLElement | null>(null);

function useMounted() {
  // False while server rendering and hydrating, true afterwards: portals need <body>.
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

function Stack({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      aria-live="polite"
      className="pointer-events-none fixed top-16 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {children}
    </section>
  );
}

/**
 * Top-right stack for toasts that manage their own list (live kills). Inside a
 * `ToastProvider` it joins the provider's stack; on its own it renders a stack
 * into <body>, where the top bar's backdrop filter can't become the containing
 * block of `position: fixed`.
 */
export function ToastViewport({ label, children }: { label: string; children: ReactNode }) {
  const mounted = useMounted();
  const slot = useContext(SlotContext);
  if (!mounted) return null;
  if (slot) return createPortal(children, slot);
  return createPortal(<Stack label={label}>{children}</Stack>, document.body);
}

/**
 * One toast: a card with a close button and a countdown bar along the bottom
 * edge. With `href` the whole card is a link. Hovering or focusing it pauses
 * the countdown; when the bar runs out the toast fades and `onDismiss` removes it.
 */
export function Toast({
  href,
  newTab = true,
  linkLabel,
  dismissLabel,
  color,
  durationMs = 30_000,
  urgent = false,
  action,
  onDismiss,
  children,
}: {
  href?: string;
  /** Open `href` in a new tab (external pages); false for pages of Keystar itself. */
  newTab?: boolean;
  linkLabel?: string;
  dismissLabel: string;
  /** Edge and countdown colour. */
  color: string;
  durationMs?: number;
  /** Announced as an alert rather than a status (errors). */
  urgent?: boolean;
  /** One button under the content; clicking it also closes the toast. */
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
  children: ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(onDismiss, LEAVE_MS);
    return () => clearTimeout(id);
  }, [leaving, onDismiss]);

  const body = "flex gap-3 rounded-[inherit] border-l-[3px] py-3 pr-9 pl-3";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={cn(
        "glass toast-in pointer-events-auto relative overflow-hidden bg-space-800/95 shadow-2xl transition-[opacity,translate] duration-300",
        leaving && "translate-x-4 opacity-0",
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      {href ? (
        <a
          href={href}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener noreferrer" : undefined}
          title={linkLabel}
          className={cn(body, "transition-colors hover:bg-surface-contrast/5")}
          style={{ borderLeftColor: color }}
        >
          {children}
        </a>
      ) : (
        <div className={cn(body, action && "rounded-b-none pb-2")} style={{ borderLeftColor: color }}>
          {children}
        </div>
      )}
      {action && (
        <div className="border-l-[3px] pr-9 pb-3 pl-10" style={{ borderLeftColor: color }}>
          <button
            type="button"
            onClick={() => {
              action.onClick();
              setLeaving(true);
            }}
            className="rounded-md px-2 py-1 text-xs font-semibold text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/12"
          >
            {action.label}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setLeaving(true)}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="absolute top-2 right-2 z-10 rounded-md p-1 text-ink-3 transition hover:bg-surface-contrast/8 hover:text-ink"
      >
        <X className="size-3.5" aria-hidden />
      </button>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-contrast/8" aria-hidden>
        <div
          className="toast-countdown h-full"
          style={{
            background: color,
            ["--toast-duration" as string]: `${durationMs}ms`,
            animationPlayState: paused || leaving ? "paused" : "running",
          }}
          onAnimationEnd={() => setLeaving(true)}
        />
      </div>
    </div>
  );
}

export type ToastTone = "neutral" | "good" | "warning" | "critical";

export interface ToastOptions {
  tone?: ToastTone;
  title: ReactNode;
  description?: ReactNode;
  /** One button under the text, e.g. Undo; clicking it also closes the toast. */
  action?: { label: string; onClick: () => void };
  /** Lifetime in milliseconds, shown by the countdown bar. */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** Short feedback toasts close sooner than live kills. */
const DEFAULT_DURATION_MS = 6000;
/** The oldest toast makes room when a new one would exceed this. */
const MAX_VISIBLE = 3;

const toneColor = {
  neutral: "var(--color-accent)",
  good: "var(--color-good)",
  warning: "var(--color-warning)",
  critical: "var(--color-critical)",
} satisfies Record<ToastTone, string>;

const toneIcon = {
  neutral: <Info className="size-4 text-accent" aria-hidden />,
  good: <CheckCircle2 className="size-4 text-good-text" aria-hidden />,
  warning: <AlertTriangle className="size-4 text-warning" aria-hidden />,
  critical: <XCircle className="size-4 text-critical-text" aria-hidden />,
} satisfies Record<ToastTone, ReactNode>;

/** Shows a feedback toast (`toast({ tone, title, description, action })`). Needs the app layout's `ToastProvider`. */
export function useToast(): { toast: (options: ToastOptions) => void } {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast needs a <ToastProvider>");
  return useMemo(() => ({ toast }), [toast]);
}

/**
 * Hosts the one toast stack in the top-right corner: feedback toasts from
 * `useToast()` first, then whatever `ToastViewport`s render (live kills).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const mounted = useMounted();
  const [items, setItems] = useState<ToastItem[]>([]);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((options: ToastOptions) => {
    const item = { ...options, id: nextId.current++ };
    setItems((list) => [...list, item].slice(-MAX_VISIBLE));
  }, []);
  const remove = useCallback((id: number) => setItems((list) => list.filter((i) => i.id !== id)), []);

  return (
    <ToastContext.Provider value={toast}>
      <SlotContext.Provider value={slot}>
        {children}
        {mounted &&
          createPortal(
            <Stack label={t.common.toast.region}>
              {/* Newest on top. */}
              {[...items].reverse().map((item) => (
                <FeedbackToast key={item.id} item={item} onRemove={remove} dismissLabel={t.common.toast.close} />
              ))}
              <div ref={setSlot} className="contents" />
            </Stack>,
            document.body,
          )}
      </SlotContext.Provider>
    </ToastContext.Provider>
  );
}

function FeedbackToast({
  item,
  onRemove,
  dismissLabel,
}: {
  item: ToastItem;
  onRemove: (id: number) => void;
  dismissLabel: string;
}) {
  const tone = item.tone ?? "neutral";
  const close = useCallback(() => onRemove(item.id), [onRemove, item.id]);
  return (
    <Toast
      dismissLabel={dismissLabel}
      color={toneColor[tone]}
      durationMs={item.durationMs ?? DEFAULT_DURATION_MS}
      urgent={tone === "critical"}
      action={item.action}
      onDismiss={close}
    >
      <div className="mt-0.5 shrink-0">{toneIcon[tone]}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{item.title}</div>
        {item.description && <div className="mt-0.5 text-xs text-ink-2">{item.description}</div>}
      </div>
    </Toast>
  );
}
