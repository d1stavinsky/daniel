"use client"

import { useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  ArrowUpLeft,
  Check,
  TriangleAlert,
  X,
} from "lucide-react"
import { getOpsInbox } from "@/app/actions/stats"
import { confirmPaymentReceived } from "@/app/actions/claims"
import { approveExceptionDocument, clearStpException } from "@/app/actions/stp"
import {
  businessWorkflowStageLabelsHe,
  nextActionLabelsHe,
  type ClaimInboxItem,
  type NextActionKind,
} from "@/lib/ops/next-action"
import { verificationToneStyles, type ClaimVerificationTone } from "@/lib/claim-verification"
import { SignedDocumentUploadModal } from "@/components/admin/signed-document-upload-modal"
import { cn } from "@/lib/utils"
import { formatIsraeliPhoneDisplay } from "@/lib/phone"

type OpsInboxProps = {
  segment: OpsInboxSegment
  page: number
  onSegmentChange: (segment: OpsInboxSegment) => void
  onPageChange: (page: number) => void
  onOpenClaim: (claimId: string) => void
}

export type OpsInboxSegment =
  | "all"
  | "urgent"
  | "sla"
  | "audit"
  | "missing_docs"
  | "review"
  | "signature"
  | "resolution"

const SEGMENTS: { value: OpsInboxSegment; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "urgent", label: "דחיפות גבוהה" },
  { value: "sla", label: "SLA הופר" },
  { value: "audit", label: "ביקורת פנימית" },
  { value: "missing_docs", label: "מסמכים חסרים" },
  { value: "review", label: "סקירה" },
  { value: "signature", label: "ממתין לחתימה" },
  { value: "resolution", label: "ממתין לסגירה" },
]

const HIGH_URGENCY_MIN = 80
const NEW_CLAIM_HIGHLIGHT_MS = 30 * 60 * 1000

/** Map UI segment → server-side inbox filter. */
function segmentFilters(segment: OpsInboxSegment): {
  action: NextActionKind | "all"
  minUrgency?: number
  slaOnly?: boolean
} {
  if (segment === "urgent") return { action: "all", minUrgency: HIGH_URGENCY_MIN }
  if (segment === "sla") return { action: "all", slaOnly: true }
  if (segment === "audit") return { action: "internal_audit" }
  if (segment === "missing_docs") return { action: "missing_docs" }
  if (segment === "review") return { action: "stp_exception" }
  if (segment === "signature") return { action: "pending_signature" }
  if (segment === "resolution") return { action: "pending_resolution" }
  return { action: "all" }
}

/** Dot color for next-action kind (actionable hierarchy). */
const actionTone: Record<Exclude<NextActionKind, "none">, ClaimVerificationTone> = {
  internal_audit: "red",
  stp_exception: "red",
  pending_approval: "yellow",
  pending_signature: "yellow",
  missing_docs: "red",
  stuck: "yellow",
  pending_resolution: "yellow",
  finance_gap: "yellow",
}

function formatAge(item: ClaimInboxItem): string {
  if (item.ageDays >= 1) {
    return item.ageDays === 1 ? "יום 1" : `${item.ageDays} ימים`
  }
  if (item.ageHours < 1) return "< שעה"
  return `${item.ageHours} שע׳`
}

function urgencyLabel(score: number): string {
  if (score >= 100) return "קריטי"
  if (score >= 80) return "גבוה"
  if (score >= 60) return "בינוני"
  return "נמוך"
}

function urgencyBarClass(score: number): string {
  if (score >= 100) return "bg-rose-500"
  if (score >= 80) return "bg-amber-400"
  if (score >= 60) return "bg-gold"
  return "bg-muted-foreground/40"
}

/** Task-prioritized inbox — default admin landing. */
export function OpsInbox({
  segment,
  page,
  onSegmentChange,
  onPageChange,
  onOpenClaim,
}: OpsInboxProps) {
  const [actionError, setActionError] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<ClaimInboxItem | null>(null)
  const { mutate: globalMutate } = useSWRConfig()

  const { data, error, isLoading, mutate } = useSWR(
    ["ops-inbox", segment, page],
    () => {
      const f = segmentFilters(segment)
      return getOpsInbox({ ...f, page, pageSize: 24 })
    },
    { keepPreviousData: true, refreshInterval: 5_000, refreshWhenHidden: false },
  )

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const emptyCopy = useMemo(() => {
    if (segment === "all") return "אין משימות ממתינות — המערכת שקטה."
    return `אין פריטים במקטע "${SEGMENTS.find((s) => s.value === segment)?.label ?? ""}".`
  }, [segment])

  function reportActionError(err: unknown) {
    setActionError(err instanceof Error ? err.message : "הפעולה נכשלה")
    setTimeout(() => setActionError(null), 6000)
  }

  /** Optimistically drop a resolved row, then refresh inbox + health KPIs. */
  async function afterResolve(claimId: string) {
    await mutate(
      (current) =>
        current
          ? {
              ...current,
              items: current.items.filter((i) => i.claimId !== claimId),
              total: Math.max(0, current.total - 1),
            }
          : current,
      { revalidate: true },
    )
    void globalMutate("ops-health")
    void globalMutate("inbox-badge")
  }

  async function approve(item: ClaimInboxItem) {
    if (!item.documentId) return
    await approveExceptionDocument(item.documentId)
    await afterResolve(item.claimId)
  }

  async function dismiss(item: ClaimInboxItem) {
    if (!item.documentId) return
    await clearStpException(item.documentId)
    await afterResolve(item.claimId)
  }

  async function confirmResolution(item: ClaimInboxItem) {
    if (
      !window.confirm(
        `לאשר שהתקבול התקבל בחשבון עבור תיק ${item.claimId}? התיק ייסגר לאחר האישור.`,
      )
    ) {
      return
    }
    await confirmPaymentReceived(item.claimId)
    await afterResolve(item.claimId)
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">תיבת משימות</h2>
          <p className="text-sm text-muted-foreground">
            מה דורש טיפול עכשיו — ממוין לפי דחיפות
          </p>
        </div>
        {total > 0 && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {total} משימות
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="סינון משימות">
        {SEGMENTS.map((s) => {
          const active = segment === s.value
          return (
            <button
              key={s.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                onSegmentChange(s.value)
                onPageChange(1)
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-gold/50 bg-gold/10 text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error instanceof Error ? error.message : "טעינת תיבת המשימות נכשלה"}
          <button
            type="button"
            className="ms-3 underline"
            onClick={() => void mutate()}
          >
            נסה שוב
          </button>
        </div>
      )}

      {actionError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {actionError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden grid-cols-[6.5rem_minmax(0,1.4fr)_5.5rem_4.5rem_11rem] gap-3 border-b border-border bg-secondary/40 px-4 py-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid">
          <span>מס׳ תיק</span>
          <span>פעולה הבאה</span>
          <span>דחיפות</span>
          <span>גיל</span>
          <span className="text-left">פעולות</span>
        </div>

        {isLoading && items.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            טוען משימות…
          </div>
        )}

        {!isLoading && items.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Inbox className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">{emptyCopy}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              מדדי הבריאות למעלה נשארים גלויים גם כשהתור ריק.
            </p>
          </div>
        )}

        <ul className="divide-y divide-border" aria-label="רשימת משימות">
          {items.map((item) => (
            <InboxRow
              key={item.claimId}
              item={item}
              onOpen={() => onOpenClaim(item.claimId)}
              onApprove={() => approve(item)}
              onDismiss={() => dismiss(item)}
              onConfirmResolution={() => confirmResolution(item)}
              onUploadSigned={() => setUploadTarget(item)}
              onError={reportActionError}
            />
          ))}
        </ul>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            עמוד {page} מתוך {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
              aria-label="עמוד קודם"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
              aria-label="עמוד הבא"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
        </div>
      )}

      <SignedDocumentUploadModal
        open={uploadTarget != null}
        claimId={uploadTarget?.claimId ?? ""}
        clientName={uploadTarget?.clientName ?? ""}
        onClose={() => setUploadTarget(null)}
        onComplete={() => {
          if (uploadTarget) void afterResolve(uploadTarget.claimId)
        }}
      />
    </div>
  )
}

type InboxRowProps = {
  item: ClaimInboxItem
  onOpen: () => void
  onApprove: () => Promise<void>
  onDismiss: () => Promise<void>
  onConfirmResolution: () => Promise<void>
  onUploadSigned: () => void
  onError: (err: unknown) => void
}

function InboxRow({
  item,
  onOpen,
  onApprove,
  onDismiss,
  onConfirmResolution,
  onUploadSigned,
  onError,
}: InboxRowProps) {
  const [busy, setBusy] = useState<"approve" | "dismiss" | "confirm" | "upload" | null>(null)
  const tone = actionTone[item.nextAction as Exclude<NextActionKind, "none">] ?? item.verificationTone
  const styles = verificationToneStyles[tone]
  const label = item.labelHe || nextActionLabelsHe[item.nextAction]
  const customerName = item.customerName || item.clientName
  const customerPhone = item.clientPhone
    ? formatIsraeliPhoneDisplay(item.clientPhone)
    : "טלפון לא זמין"
  const isNewClaim =
    item.createdAt != null &&
    Date.now() - new Date(item.createdAt).getTime() <= NEW_CLAIM_HIGHLIGHT_MS
  // Inline resolve only works when the action targets a specific document.
  // Internal audit rows are intentionally excluded — resolution requires
  // correcting the demand/appraisal data, not a one-click override.
  const canResolveInline =
    Boolean(item.documentId) &&
    (item.nextAction === "stp_exception" || item.nextAction === "pending_approval")
  const canConfirmResolution = item.nextAction === "pending_resolution"
  const canUploadSigned = item.nextAction === "pending_signature"

  async function run(kind: "approve" | "dismiss" | "confirm", fn: () => Promise<void>) {
    setBusy(kind)
    try {
      await fn()
    } catch (err) {
      onError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <li>
      <div
        className={cn(
          "grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/30 md:grid-cols-[6.5rem_minmax(0,1.4fr)_5.5rem_4.5rem_11rem] md:items-center md:gap-3",
          isNewClaim && "bg-gold/5 ring-1 ring-inset ring-gold/25",
          busy && "opacity-70",
        )}
        aria-busy={busy != null}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-mono text-sm font-medium tabular-nums text-foreground">
              {item.claimId}
            </p>
            {isNewClaim && (
              <span className="rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[9px] font-semibold text-gold">
                חדש
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground md:hidden">
            שם לקוח: {customerName} · רכב: {item.plate} · טלפון: {customerPhone}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn("size-2 shrink-0 rounded-full", styles.bar)}
              title={styles.label}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-foreground">{label}</span>
            {item.slaBreached && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600"
                title={`חריגת SLA: מעל ${item.ageDays} ימים בשלב ${item.slaStage === 3 ? "חקירה" : "דרישה"}`}
              >
                <TriangleAlert className="size-3" aria-hidden="true" />
                SLA הופר
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.reason}>
            {item.reason}
          </p>
          <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground/80 md:block">
            שם לקוח: {customerName} · רכב: {item.plate} · טלפון: {customerPhone} · {item.partnerName}
          </p>
          <p className="mt-1 text-[10px] font-medium text-gold/80">
            שלב {item.workflowStage} · {businessWorkflowStageLabelsHe[item.workflowStage]}
          </p>
        </div>

        <div className="flex items-center gap-2 md:flex-col md:items-stretch md:gap-1">
          <span className="text-xs text-muted-foreground md:hidden">דחיפות</span>
          <div className="flex items-center gap-2">
            <div className="h-1 w-12 overflow-hidden rounded-full bg-secondary md:w-full">
              <div
                className={cn("h-full rounded-full", urgencyBarClass(item.urgencyScore))}
                style={{ width: `${Math.min(100, item.urgencyScore)}%` }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-foreground">
              {urgencyLabel(item.urgencyScore)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:block">
          <span className="text-xs text-muted-foreground md:hidden">גיל</span>
          <span className="text-sm tabular-nums text-foreground">{formatAge(item)}</span>
        </div>

        <div className="flex items-center gap-1.5 md:justify-end">
          {canUploadSigned && (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => {
                setBusy("upload")
                onUploadSigned()
                setBusy(null)
              }}
              title="סומן כחתום והעלה — מכתב דרישה חתום"
              className="inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-gold/20 disabled:opacity-50"
            >
              <Check className="size-3.5" aria-hidden="true" />
              סומן כחתום והעלה
            </button>
          )}
          {canConfirmResolution && (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void run("confirm", onConfirmResolution)}
              title="אישור תקבול וסגירת התיק"
              className="inline-flex items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-gold/20 disabled:opacity-50"
            >
              {busy === "confirm" ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-3.5" aria-hidden="true" />
              )}
              אישור תקבול
            </button>
          )}
          {canResolveInline && (
            <>
              <button
                type="button"
                disabled={busy != null}
                onClick={() => void run("approve", onApprove)}
                title="אישור המסמך ללא פתיחת התיק"
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/15 disabled:opacity-50"
              >
                {busy === "approve" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                אישור
              </button>
              <button
                type="button"
                disabled={busy != null}
                onClick={() => void run("dismiss", onDismiss)}
                title="סגירת החריג ללא שינוי סטטוס המסמך"
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                {busy === "dismiss" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="size-3.5" aria-hidden="true" />
                )}
                דחייה
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy != null}
            onClick={onOpen}
            title="פתיחת התיק"
            aria-label={`פתיחת תיק ${item.claimId}`}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-gold/40 hover:bg-gold/8 hover:text-foreground disabled:opacity-50"
          >
            <ArrowUpLeft className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  )
}
