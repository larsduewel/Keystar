"use client";

import { Bug, Check, CheckCircle2, Copy, Download, ExternalLink, FileJson, Package, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import type { CheckStatus } from "@/core/system/checks";
import type { RedactionRule } from "@/core/system/redact";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { recordSupportPackageDownload } from "../actions";

export interface Problem {
  status: CheckStatus;
  label: string;
  detail: string;
}

export interface SystemDialogData {
  summary: string;
  packageJson: string;
  packageFilename: string;
  redactions: Record<RedactionRule, number>;
  bugReportUrl: string;
  /** Issue search without a query; the dialog appends what the user types. */
  issueSearchUrl: string;
  version: string;
  problems: Problem[];
  logsCommand: string;
}

type DialogKind = "package" | "issue";
const OpenContext = createContext<((kind: DialogKind) => void) | null>(null);

/** Saves exactly the previewed package, then records the download in the audit log. */
function download(data: SystemDialogData) {
  const url = URL.createObjectURL(new Blob([data.packageJson + "\n"], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = data.packageFilename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  void recordSupportPackageDownload(data.packageFilename).catch(() => undefined);
}

async function copy(text: string): Promise<boolean> {
  // The Clipboard API needs a secure context (https or localhost) and permission.
  return (await navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  )) ?? false;
}

/** Hosts the support package and report dialogs; buttons anywhere below open them. */
export function SystemDialogs({ data, children }: { data: SystemDialogData; children: ReactNode }) {
  const packageRef = useRef<HTMLDialogElement>(null);
  const issueRef = useRef<HTMLDialogElement>(null);
  const open = (kind: DialogKind) => (kind === "package" ? packageRef : issueRef).current?.showModal();
  return (
    <OpenContext.Provider value={open}>
      {children}
      <PackageDialog ref={packageRef} data={data} />
      <IssueDialog ref={issueRef} data={data} onDownload={() => packageRef.current?.showModal()} />
    </OpenContext.Provider>
  );
}

/** A visible warning wherever private data (names, IDs, the server's address) could leave the instance. */
export function PrivacyNote({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useI18n();
  return (
    <p className={cn("flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-ink-2 ring-1 ring-warning/25 ring-inset", className)}>
      <ShieldAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
      <span>
        <span className="font-medium text-warning">{t.admin.system.privacy.label}:</span> {children}
      </span>
    </p>
  );
}

export function OpenDialogButton({
  kind,
  variant = "glass",
  size = "md",
  children,
}: {
  kind: DialogKind;
  variant?: "glass" | "primary" | "ghost";
  size?: "sm" | "md";
  children: ReactNode;
}) {
  const open = useContext(OpenContext);
  return (
    <Button type="button" variant={variant} size={size} onClick={() => open?.(kind)}>
      {children}
    </Button>
  );
}

export function CopySummaryButton({ summary }: { summary: string }) {
  const { t } = useI18n();
  const { toast } = useToast();
  return (
    <Button
      type="button"
      onClick={async () => {
        const ok = await copy(summary);
        toast(
          ok
            ? { tone: "good", title: t.admin.system.actions.summaryCopied }
            : { tone: "warning", title: t.common.copy.failed, description: t.common.copy.failedHint },
        );
      }}
    >
      <Copy className="size-4" aria-hidden /> {t.admin.system.actions.copySummary}
    </Button>
  );
}

/** Collects everything again: the page is rendered on the server per request. */
export function RecheckButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden /> {t.admin.system.overall.recheck}
    </Button>
  );
}

function DialogFrame({
  ref,
  labelledBy,
  icon,
  title,
  intro,
  closeLabel,
  footer,
  children,
}: {
  ref: React.Ref<HTMLDialogElement>;
  labelledBy: string;
  icon: ReactNode;
  title: string;
  intro: string;
  closeLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      className="m-auto max-h-[min(860px,calc(100dvh-2rem))] w-[min(1040px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-transparent p-0 text-ink backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <div className="glass flex max-h-[inherit] flex-col bg-space-800/95">
        <header className="flex items-start gap-3.5 border-b border-surface-contrast/[0.075] px-6 pt-5 pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent/12 text-accent">{icon}</span>
          <div className="min-w-0 flex-1">
            <h2 id={labelledBy} className="text-xl font-semibold">
              {title}
            </h2>
            <p className="mt-1 text-sm text-ink-2">{intro}</p>
          </div>
          <form method="dialog">
            <Button type="submit" variant="ghost" className="size-9 px-0" aria-label={closeLabel}>
              <X className="size-4" aria-hidden />
            </Button>
          </form>
        </header>
        {children}
        {footer}
      </div>
    </dialog>
  );
}

function PackageDialog({ ref, data }: { ref: React.Ref<HTMLDialogElement>; data: SystemDialogData }) {
  const { t } = useI18n();
  const tp = t.admin.system.package;
  const [copied, setCopied] = useState(false);
  const sizeKb = Math.max(1, Math.round(new Blob([data.packageJson]).size / 1024));
  const removed = (Object.keys(data.redactions) as RedactionRule[]).filter((r) => data.redactions[r] > 0);
  return (
    <DialogFrame
      ref={ref}
      labelledBy="support-package-title"
      icon={<Package className="size-5" aria-hidden />}
      title={tp.title}
      intro={tp.intro}
      closeLabel={tp.close}
      footer={
        <footer className="flex flex-wrap items-center gap-3 border-t border-surface-contrast/[0.075] px-6 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <FileJson className="size-4 shrink-0 text-ink-2" aria-hidden />
            <span className="truncate font-mono text-xs">{data.packageFilename}</span>
            <span className="text-xs text-ink-3">· {tp.size(sizeKb)}</span>
          </div>
          <span className="text-xs text-ink-3">{tp.auditNote}</span>
          <form method="dialog">
            <Button type="submit">{tp.cancel}</Button>
          </form>
          <Button type="button" variant="primary" onClick={() => download(data)}>
            <Download className="size-4" aria-hidden /> {tp.download}
          </Button>
        </footer>
      }
    >
      <div className="grid min-h-0 flex-1 md:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-5 overflow-y-auto border-surface-contrast/[0.075] px-6 py-5 md:border-r">
          <section>
            <h3 className="eve-label mb-1.5 text-2xs text-ink-3">{tp.included}</h3>
            <ul className="divide-y divide-surface-contrast/[0.045] text-sm">
              {tp.includedItems.map(([item, hint]) => (
                <li key={item} className="flex items-center gap-2.5 py-1.5">
                  <Check className="size-3.5 shrink-0 text-good-text" aria-hidden />
                  <span className="flex-1">{item}</span>
                  <span className="text-right font-mono text-3xs text-ink-3">{hint}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="eve-label mb-1.5 text-2xs text-ink-3">{tp.never}</h3>
            <ul className="divide-y divide-surface-contrast/[0.045] text-sm text-ink-2">
              {tp.neverItems.map((item) => (
                <li key={item} className="flex items-center gap-2.5 py-1.5">
                  <X className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <PrivacyNote>{t.admin.system.privacy.package}</PrivacyNote>
          {removed.length > 0 && (
            <section>
              <h3 className="eve-label mb-2 text-2xs text-ink-3">{tp.removed}</h3>
              <div className="flex flex-wrap gap-1.5">
                {removed.map((rule) => (
                  <Badge key={rule}>{tp.rules[rule](data.redactions[rule])}</Badge>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-2.5 px-6 py-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="eve-label text-2xs text-ink-3">{tp.preview}</h3>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                if (await copy(data.packageJson)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
            >
              {copied ? <Check className="size-3.5 text-good-text" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              {copied ? t.common.copy.copied : tp.copyJson}
            </Button>
          </div>
          <pre className="glass-inset min-h-64 flex-1 overflow-auto rounded-lg px-4 py-3 font-mono text-xs leading-relaxed text-ink-2">
            {data.packageJson}
          </pre>
        </div>
      </div>
    </DialogFrame>
  );
}

function Step({ n, done, children }: { n: number; done?: boolean; children: ReactNode }) {
  return (
    <li className="glass-inset flex gap-3.5 rounded-lg px-4 py-3.5">
      <span
        aria-hidden
        className={cn(
          "grid size-6.5 shrink-0 place-items-center rounded-full font-mono text-2xs ring-1 ring-inset",
          done ? "bg-good/18 text-good-text ring-good/35" : "bg-accent/12 text-accent ring-accent/30",
        )}
      >
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function IssueDialog({
  ref,
  data,
  onDownload,
}: {
  ref: React.Ref<HTMLDialogElement>;
  data: SystemDialogData;
  onDownload: () => void;
}) {
  const { t } = useI18n();
  const ti = t.admin.system.issue;
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const searchHref = `${data.issueSearchUrl}${encodeURIComponent(query ? ` ${query}` : "")}`;
  return (
    <DialogFrame
      ref={ref}
      labelledBy="report-issue-title"
      icon={<Bug className="size-5" aria-hidden />}
      title={ti.title}
      intro={ti.intro}
      closeLabel={ti.close}
    >
      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_380px]">
        <ol className="space-y-2.5 overflow-y-auto border-surface-contrast/[0.075] px-6 py-5 md:border-r">
          <Step n={1} done={!data.problems.length}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{ti.checks.title}</span>
              {data.problems.length ? (
                <Badge tone="warning">{ti.checks.problems(data.problems.length)}</Badge>
              ) : (
                <Badge tone="good">{ti.checks.none}</Badge>
              )}
            </div>
            {data.problems.length > 0 && (
              <>
                <p className="mt-0.5 text-xs text-ink-3">{ti.checks.body}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4.5 text-xs">
                  {data.problems.map((p) => (
                    <li key={p.label}>
                      <span className={p.status === "fail" ? "text-critical-text" : "text-warning"}>{p.label}.</span>{" "}
                      <span className="text-ink-2">{p.detail}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Step>
          <Step n={2}>
            <div className="font-medium">{ti.search.title}</div>
            <p className="mt-0.5 text-xs text-ink-3">{ti.search.body}</p>
            <div className="mt-2.5 flex gap-2">
              <label htmlFor="issue-search" className="sr-only">
                {ti.search.label}
              </label>
              <input
                id="issue-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={ti.search.placeholder}
                className="glass-inset h-8 min-w-0 flex-1 rounded-lg px-2.5 text-xs text-ink placeholder:text-ink-3"
              />
              <a href={searchHref} target="_blank" rel="noopener noreferrer" className={buttonClass("glass", "sm")}>
                {ti.search.button} <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">{t.common.opensInNewTab}</span>
              </a>
            </div>
          </Step>
          <Step n={3}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{ti.download.title}</div>
                <p className="mt-0.5 text-xs text-ink-3">{ti.download.body}</p>
              </div>
              <Button type="button" size="sm" onClick={onDownload}>
                <Download className="size-3.5" aria-hidden /> {ti.download.button}
              </Button>
            </div>
          </Step>
          <Step n={4}>
            <div className="font-medium">{ti.logs.title}</div>
            <p className="mt-0.5 mb-2 text-xs text-ink-3">{ti.logs.body}</p>
            <CopyField value={data.logsCommand} />
            <PrivacyNote className="mt-2">{t.admin.system.privacy.logs}</PrivacyNote>
          </Step>
          <Step n={5}>
            <div className="font-medium">{ti.open.title}</div>
            <p className="mt-0.5 text-xs text-ink-3">{ti.open.body}</p>
          </Step>
        </ol>
        <aside aria-labelledby="issue-prefilled" className="flex min-h-0 flex-col gap-3.5 px-6 py-5">
          <h3 id="issue-prefilled" className="eve-label text-2xs text-ink-3">
            {ti.prefilled}
          </h3>
          <div>
            <div className="mb-1 text-2xs text-ink-3">{ti.version}</div>
            <div className="glass-inset rounded-lg px-3 py-2 text-sm">{data.version}</div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-1 text-2xs text-ink-3">{ti.summary}</div>
            <pre className="glass-inset min-h-40 flex-1 overflow-auto rounded-lg px-3 py-2.5 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-ink-2">
              {data.summary}
            </pre>
          </div>
          <Button
            type="button"
            onClick={async () => {
              if (await copy(data.summary)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
          >
            {copied ? <CheckCircle2 className="size-4 text-good-text" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? t.common.copy.copied : ti.copySummary}
          </Button>
          <PrivacyNote>{t.admin.system.privacy.report}</PrivacyNote>
          <a href={data.bugReportUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
            {ti.openGithub} <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">{t.common.opensInNewTab}</span>
          </a>
        </aside>
      </div>
    </DialogFrame>
  );
}
