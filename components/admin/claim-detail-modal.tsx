"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { X, FileText, FileDown, Car, Building2, Lock, Banknote, ShieldCheck, Trash2, UserRound, CalendarDays, Plus, UserPlus, ChevronRight, PenLine, Loader2, Mail, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  fetchDemandLetterWorkflowState,
  generateDemandLetterDraft,
} from "@/app/actions/demand-letter"
import { MatchBadge } from "@/components/admin/match-badge"
import { Sparkline } from "@/components/admin/sparkline"
import { ClaimProgressBadge } from "@/components/admin/claim-progress-badge"
import { DocumentsPanel } from "@/components/documents/documents-panel"
import { ManualEmailModal } from "@/components/admin/manual-email-modal"
import { ClaimCommunications } from "@/components/admin/claim-communications"
import {
  matchState,
  progressPercent,
  isPaymentReceived,
  formatCurrency,
  formatMoneyInput,
  parseMoneyInput,
  moneyEquals,
  claimProgressLabels,
  type WorkflowClaim,
} from "@/lib/workflow-data"
import { cn } from "@/lib/utils"
import { formatIsraeliPhoneDisplay } from "@/lib/phone"

export type ClaimViewMode = "admin" | "partner"

type ClaimDetailModalProps = {
  claim: WorkflowClaim | null
  mode: ClaimViewMode
  originView?: "inbox" | "claims" | "finance" | "partners" | "settings" | null
  onClose: () => void
  onBackToInbox?: () => void
  onSetAmounts?: (claimId: string, requested: number, received: number) => void
  onToggleFunds?: (claimId: string) => void
  onGenerateReport: (claim: WorkflowClaim) => void
  onDeleteClaim?: (claimId: string) => Promise<void> | void
  onAddContributor?: (claimId: string, name: string) => Promise<void> | void
  onRemoveContributor?: (claimId: string, name: string) => Promise<void> | void
  /** Refresh claim after document mutations so progress status stays current. */
  onClaimRefresh?: (claimId: string) => Promise<void> | void
  onConfirmPayment?: (claimId: string) => Promise<void> | void
  canSendManualEmail?: boolean
}

export function ClaimDetailModal({
  claim,
  mode,
  originView,
  onClose,
  onBackToInbox,
  onSetAmounts,
  onToggleFunds,
  onGenerateReport,
  onDeleteClaim,
  onAddContributor,
  onRemoveContributor,
  onClaimRefresh,
  onConfirmPayment,
  canSendManualEmail = false,
}: ClaimDetailModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const isAdmin = mode === "admin"
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  const { data: demandState, mutate: mutateDemandState } = useSWR(
    claim && isAdmin ? ["demand-letter-state", claim.id] : null,
    () => fetchDemandLetterWorkflowState(claim!.id),
  )
  const [contributorDraft, setContributorDraft] = useState("")
  const [addingContributor, setAddingContributor] = useState(false)
  const [showAddContributor, setShowAddContributor] = useState(false)
  const [contributorError, setContributorError] = useState<string | null>(null)
  const [confirmingPayment, setConfirmingPayment] = useState(false)
  const [paymentAcknowledged, setPaymentAcknowledged] = useState(false)
  const [paymentConfirmError, setPaymentConfirmError] = useState<string | null>(null)
  const [showManualEmail, setShowManualEmail] = useState(false)
  const [selectedEmailDocuments, setSelectedEmailDocuments] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<"details" | "communications">("details")
  const selectedEmailDocumentIds = useMemo(
    () => Array.from(selectedEmailDocuments),
    [selectedEmailDocuments],
  )

  useEffect(() => {
    if (!claim) return
    setConfirmDelete(false)
    setDeleting(false)
    setContributorDraft("")
    setShowAddContributor(false)
    setContributorError(null)
    setPaymentConfirmError(null)
    setPaymentAcknowledged(false)
    setShowManualEmail(false)
    setSelectedEmailDocuments(new Set())
    setActiveTab("details")
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [claim, onClose])

  if (!claim) return null

  const paymentReceived = isPaymentReceived(claim)
  const pct = progressPercent(claim)
  const claimId = claim.id
  const contributors = claim.contributors ?? []

  async function handleDelete() {
    if (!onDeleteClaim || !isAdmin) return
    setDeleting(true)
    try {
      await onDeleteClaim(claimId)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleAddContributor() {
    if (!onAddContributor || !isAdmin) return
    setContributorError(null)
    setAddingContributor(true)
    try {
      await onAddContributor(claimId, contributorDraft)
      setContributorDraft("")
      setShowAddContributor(false)
    } catch (err) {
      setContributorError(err instanceof Error ? err.message : "הוספה נכשלה")
    } finally {
      setAddingContributor(false)
    }
  }

  async function handleConfirmPayment() {
    if (!onConfirmPayment || !isAdmin || !paymentAcknowledged) return
    setPaymentConfirmError(null)
    setConfirmingPayment(true)
    try {
      await onConfirmPayment(claimId)
      setPaymentAcknowledged(false)
    } catch (err) {
      setPaymentConfirmError(err instanceof Error ? err.message : "אישור התקבול נכשל")
    } finally {
      setConfirmingPayment(false)
    }
  }

  async function handleGenerateDemandDraft() {
    if (!isAdmin) return
    setDraftError(null)
    setGeneratingDraft(true)
    try {
      await generateDemandLetterDraft(claimId)
      await mutateDemandState()
      await onClaimRefresh?.(claimId)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "הפקת הטיוטה נכשלה")
    } finally {
      setGeneratingDraft(false)
    }
  }

  const showDemandDraftAction =
    isAdmin && demandState && !demandState.validated && !claim.closed

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-modal-title"
        className="glass-strong relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/10 shadow-2xl shadow-black/50 sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            {originView === "inbox" && onBackToInbox && (
              <button
                type="button"
                onClick={onBackToInbox}
                className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronRight className="size-3.5" aria-hidden="true" />
                חזרה לתיבת משימות
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="claim-modal-title" className="text-lg font-semibold text-foreground">
                שם לקוח: {claim.customerName || claim.clientName}
              </h2>
              <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {claim.id}
              </span>
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium ring-1",
                  claim.progressStatus === "completed" && "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
                  claim.progressStatus === "pending_resolution" &&
                    "bg-amber-400/15 text-amber-700 ring-amber-400/30",
                  claim.progressStatus === "in_progress" && "bg-gold/15 text-gold ring-gold/30",
                  claim.progressStatus === "pending" && "bg-secondary text-muted-foreground ring-border",
                )}
              >
                {claimProgressLabels[claim.progressStatus]}
              </span>
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium",
                  isAdmin ? "bg-gold/15 text-gold" : "bg-secondary text-muted-foreground",
                )}
              >
                {isAdmin ? "מצב ניהול" : "תצוגת שותף"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Car className="size-3.5" aria-hidden="true" />
                רכב: {claim.carModel} · {claim.plate}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden="true" />
                טלפון: {claim.clientPhone
                  ? formatIsraeliPhoneDisplay(claim.clientPhone)
                  : "טלפון לא זמין"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" aria-hidden="true" />
                {claim.partnerName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-3.5" aria-hidden="true" />
                נוצר ע״י: {claim.createdByName || "—"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                תאריך: {claim.date || "—"}
              </span>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="סגירת חלון"
          >
            <X className="size-5" />
          </button>
        </div>

        {canSendManualEmail && (
          <div
            role="tablist"
            aria-label="אזורי התיק"
            className="flex border-b border-border bg-card/40 px-5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "details"}
              onClick={() => setActiveTab("details")}
              className={cn(
                "border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
                activeTab === "details"
                  ? "border-gold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              פרטי התיק
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "communications"}
              onClick={() => setActiveTab("communications")}
              className={cn(
                "border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
                activeTab === "communications"
                  ? "border-gold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              תכתובות נכנסות
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {activeTab === "details" && (
            <>
          {/* Accountability — contributors */}
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">תורמים לתיק</h3>
              {isAdmin && onAddContributor && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddContributor((v) => !v)
                    setContributorError(null)
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gold transition-colors hover:text-gold/80"
                >
                  <UserPlus className="size-3.5" aria-hidden="true" />
                  הוספת תורם
                </button>
              )}
            </div>

            {contributors.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">טרם נוספו תורמים לתיק זה.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {contributors.map((name) => (
                  <li
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-secondary/40 px-2.5 py-1 text-xs text-foreground"
                  >
                    {name}
                    {isAdmin && onRemoveContributor && (
                      <button
                        type="button"
                        onClick={() => void onRemoveContributor(claimId, name)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`הסרת ${name}`}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {showAddContributor && isAdmin && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={contributorDraft}
                    onChange={(e) => setContributorDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void handleAddContributor()
                      }
                    }}
                    placeholder="שם מלא"
                    aria-label="שם תורם"
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={addingContributor || contributorDraft.trim().length < 2}
                    onClick={() => void handleAddContributor()}
                    className="shrink-0"
                  >
                    <Plus className="size-3.5" />
                    {addingContributor ? "מוסיף…" : "הוסף"}
                  </Button>
                </div>
                {contributorError && (
                  <p className="text-xs text-destructive" role="alert">
                    {contributorError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Financial controls */}
          <FinancialControls
            claim={claim}
            isAdmin={isAdmin}
            pct={pct}
            onSetAmounts={onSetAmounts}
            onToggleFunds={onToggleFunds}
          />

          {isAdmin && claim.progressStatus === "pending_resolution" && !claim.paymentConfirmed && (
            <div className="border-b border-border bg-amber-400/8 px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">שלב 6 · סגירה</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                כל המסמכים אומתו. אשרו שהכסף התקבל בחשבון לפני סגירת התיק.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-400/30 bg-background/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-border accent-gold"
                  checked={paymentAcknowledged}
                  onChange={(e) => setPaymentAcknowledged(e.target.checked)}
                  aria-label="אישור שהכסף התקבל בחשבון"
                />
                <span className="text-sm text-foreground">אישור תקבול — הכסף בחשבון</span>
              </label>
              {paymentConfirmError && (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {paymentConfirmError}
                </p>
              )}
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={
                  confirmingPayment ||
                  !onConfirmPayment ||
                  !paymentAcknowledged ||
                  claim.receivedAmount <= 0
                }
                onClick={() => void handleConfirmPayment()}
              >
                {confirmingPayment ? "מאשר…" : "אישור תקבול וסגירת תיק"}
              </Button>
              {claim.receivedAmount <= 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  עדכנו את סכום שהתקבל לפני האישור.
                </p>
              )}
            </div>
          )}

          <div className="border-b border-border px-5 py-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">סטטוס תיק</h3>
            <ClaimProgressBadge status={claim.progressStatus} uploadedCount={claim.uploadedDocCount} />
            <p className="mt-2 text-xs text-muted-foreground">
              הסטטוס מתעדכן אוטומטית לפי מספר המסמכים שאומתו מתוך {claim.requiredDocCount}.
            </p>
          </div>

          {showDemandDraftAction && (
            <div className="border-b border-border px-5 py-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <PenLine className="size-4 text-gold" aria-hidden="true" />
                מכתב דרישה לחתימה
              </h3>
              {demandState.pendingSignature ? (
                <p className="text-sm text-amber-600">
                  טיוטה הופקה — התיק ממתין לחתימת עו״ד והעלאת סריקה דרך תיבת המשימות.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  לאחר השלמת מסמכי החקירה, הפק טיוטה לחתימה. התיק יועבר אוטומטית למקטע ממתין לחתימה.
                </p>
              )}
              {draftError && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {draftError}
                </p>
              )}
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={generatingDraft || !demandState.canGenerate || demandState.pendingSignature}
                onClick={() => void handleGenerateDemandDraft()}
              >
                {generatingDraft ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    מפיק טיוטה…
                  </>
                ) : (
                  "הפקת מכתב דרישה לחתימה"
                )}
              </Button>
              {!demandState.canGenerate && demandState.generateBlockedReason && !demandState.pendingSignature && (
                <p className="mt-2 text-xs text-muted-foreground">{demandState.generateBlockedReason}</p>
              )}
            </div>
          )}

          {canSendManualEmail && (
            <div className="border-b border-border px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Mail className="size-4 text-gold" aria-hidden="true" />
                תקשורת ידנית
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                שליחת דוא״ל יזומה בלבד, עם אפשרות לבחור מסמכים מהתיק כצרופות.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setShowManualEmail(true)}
              >
                <Mail className="size-4" />
                שליחת דוא״ל
                {selectedEmailDocuments.size > 0 ? ` (${selectedEmailDocuments.size})` : ""}
              </Button>
            </div>
          )}

          {/* Required documents — admin has full control; partner is view/download only */}
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="size-4 text-gold" aria-hidden="true" />
                מסמכים נדרשים
              </h3>
              {canSendManualEmail && (
                <span className="text-[11px] text-muted-foreground">
                  {selectedEmailDocuments.size > 0
                    ? `${selectedEmailDocuments.size} קבצים נבחרו למייל`
                    : "סמנו קבצים לצירוף למייל"}
                </span>
              )}
            </div>
            <DocumentsPanel
              claimId={claim.id}
              mode={mode}
              onDocumentsChanged={() => onClaimRefresh?.(claim.id)}
              selectedDocumentIds={canSendManualEmail ? selectedEmailDocuments : undefined}
              onDocumentSelectionChange={
                canSendManualEmail
                  ? (documentId, selected) => {
                      setSelectedEmailDocuments((previous) => {
                        const next = new Set(previous)
                        if (selected) {
                          if (next.size >= 10) return previous
                          next.add(documentId)
                        } else {
                          next.delete(documentId)
                        }
                        return next
                      })
                    }
                  : undefined
              }
            />
          </div>
            </>
          )}
          {activeTab === "communications" && canSendManualEmail && (
            <div className="p-5">
              <ClaimCommunications
                claimId={claim.id}
                onDocumentsChanged={() => onClaimRefresh?.(claim.id)}
              />
            </div>
          )}
        </div>

        {/* Footer — admin only (partners never see delete / report actions) */}
        {isAdmin && activeTab === "details" && (
          <div className="flex flex-col gap-3 border-t border-border p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {!paymentReceived && <Lock className="size-3.5" aria-hidden="true" />}
                {paymentReceived
                  ? "כל המסמכים אומתו ותקבול אושר — ניתן להפיק דוח סגירה."
                  : claim.progressStatus === "pending_resolution"
                    ? `כל ${claim.requiredDocCount} המסמכים אומתו — נדרש אישור תקבול לפני סגירה.`
                    : `דוח הסגירה ננעל עד לאימות כל ${claim.requiredDocCount} המסמכים הנדרשים.`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmDelete((v) => !v)}
                  disabled={deleting || !onDeleteClaim}
                  className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  מחיקת תיק
                </Button>
                <Button
                  onClick={() => onGenerateReport(claim)}
                  disabled={!paymentReceived || deleting}
                  className="shrink-0 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <FileDown className="size-4" />
                  הפקת דוח סגירה
                </Button>
              </div>
            </div>

            {confirmDelete && (
              <div
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3"
                role="alertdialog"
                aria-label="אישור מחיקת תיק"
              >
                <p className="text-sm font-medium text-destructive">
                  למחוק את תיק {claim.id} לצמיתות? פעולה זו אינה ניתנת לביטול.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  יימחקו גם שלבים, מסמכים, תנועות כספיות והתראות הקשורים לתיק.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={deleting}
                    onClick={handleDelete}
                  >
                    {deleting ? "מוחק…" : "כן, מחק תיק"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                  >
                    ביטול
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {canSendManualEmail && (
        <ManualEmailModal
          claimId={claim.id}
          open={showManualEmail}
          onClose={() => setShowManualEmail(false)}
          initialSelectedDocumentIds={selectedEmailDocumentIds}
        />
      )}
    </div>
  )
}

function FinancialControls({
  claim,
  isAdmin,
  pct,
  onSetAmounts,
  onToggleFunds,
}: {
  claim: WorkflowClaim
  isAdmin: boolean
  pct: number
  onSetAmounts?: (claimId: string, requested: number, received: number) => void
  onToggleFunds?: (claimId: string) => void
}) {
  const [requested, setRequested] = useState(formatMoneyInput(claim.requestedAmount))
  const [received, setReceived] = useState(formatMoneyInput(claim.receivedAmount))

  // Re-sync local inputs when a different claim is opened
  useEffect(() => {
    setRequested(formatMoneyInput(claim.requestedAmount))
    setReceived(formatMoneyInput(claim.receivedAmount))
  }, [claim.id, claim.requestedAmount, claim.receivedAmount])

  const dirty =
    !moneyEquals(parseMoneyInput(requested), claim.requestedAmount) ||
    !moneyEquals(parseMoneyInput(received), claim.receivedAmount)
  const released = claim.fundsReleased ?? false

  if (!isAdmin) {
    return (
      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
        <SummaryCell label="נדרש" value={formatCurrency(claim.requestedAmount)} />
        <SummaryCell
          label="התקבל · יתרה"
          value={claim.receivedAmount > 0 ? formatCurrency(claim.receivedAmount) : "—"}
          extra={<Sparkline requested={claim.requestedAmount} received={claim.receivedAmount} showRatio />}
        />
        <SummaryCell label="התאמה" custom={<MatchBadge state={matchState(claim)} />} />
        <SummaryCell
          label="סטטוס תשלום"
          custom={
            released ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-trust-foreground">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                שוחררו כספים
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">בטיפול</span>
            )
          }
        />
      </div>
    )
  }

  return (
    <div className="border-b border-border bg-card/40 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">בקרה פיננסית</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <MatchBadge state={matchState(claim)} />
          <span className="tabular-nums">{pct}% הושלם</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AmountField label="סכום נדרש (₪)" value={requested} onChange={setRequested} />
        <AmountField label="סכום שהתקבל (₪)" value={received} onChange={setReceived} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Sparkline
          requested={parseMoneyInput(requested) || 0}
          received={parseMoneyInput(received) || 0}
          showRatio
        />
        <span className="text-xs text-muted-foreground">מאזן נדרש מול התקבל</span>
        <Button
          size="sm"
          onClick={() => {
            const req = parseMoneyInput(requested)
            const rec = parseMoneyInput(received)
            console.log("[שמירת סכומים] parsed from inputs", {
              claimId: claim.id,
              rawRequested: requested,
              rawReceived: received,
              req,
              rec,
            })
            if (!Number.isFinite(req) || !Number.isFinite(rec) || req < 0 || rec < 0) {
              console.log("[שמירת סכומים] blocked — invalid parse")
              return
            }
            onSetAmounts?.(claim.id, req, rec)
          }}
          disabled={!dirty}
          className="ms-auto disabled:cursor-not-allowed disabled:opacity-45"
        >
          שמירת סכומים
        </Button>
      </div>

      {/* Release funds toggle */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Banknote className="size-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">שחרור כספים לשותף</p>
            <p className="text-[11px] text-muted-foreground">
              {released ? "הכספים שוחררו והוצגו בפורטל השותף" : "טרם שוחררו כספים"}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={released}
          aria-label="שחרור כספים לשותף"
          onClick={() => onToggleFunds?.(claim.id)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
            released ? "bg-gold" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "inline-block size-4 transform rounded-full bg-background shadow transition-transform",
              // RTL: the "on" position moves the knob to the left
              released ? "-translate-x-1" : "-translate-x-6",
            )}
          />
        </button>
      </div>
    </div>
  )
}

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm tabular-nums text-foreground outline-none transition-colors focus:border-gold focus:ring-1 focus:ring-gold"
        dir="ltr"
      />
    </label>
  )
}

function SummaryCell({
  label,
  value,
  custom,
  extra,
}: {
  label: string
  value?: string
  custom?: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 bg-card/70 p-3">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {custom ?? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
          {extra}
        </div>
      )}
    </div>
  )
}
