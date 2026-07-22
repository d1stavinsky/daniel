"use client"

import { useEffect, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { Menu, Plus, Pencil, Eye, RefreshCw } from "lucide-react"
import { AdminSidebar, type AdminView } from "@/components/admin/admin-sidebar"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { WorkflowTable } from "@/components/admin/workflow-table"
import { ClaimDetailModal, type ClaimViewMode } from "@/components/admin/claim-detail-modal"
import { MatchingEngine } from "@/components/admin/matching-engine"
import { OpsHealthSummary } from "@/components/admin/ops-health-summary"
import { OpsInbox, type OpsInboxSegment } from "@/components/admin/ops-inbox"
import { WorkflowSummary } from "@/components/admin/workflow-summary"
import { SettingsView } from "@/components/admin/settings-view"
import { AddClaimDialog, type NewClaimInput } from "@/components/admin/add-claim-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AppRole } from "@/lib/rbac"
import type { ClaimsDashboardStats } from "@/app/actions/claims"
import {
  createClaim as createClaimAction,
  setAmounts as setAmountsAction,
  toggleFunds as toggleFundsAction,
  deleteClaim as deleteClaimAction,
  getClaimById as getClaimByIdAction,
  addClaimContributor as addClaimContributorAction,
  removeClaimContributor as removeClaimContributorAction,
  confirmPaymentReceived as confirmPaymentReceivedAction,
} from "@/app/actions/claims"
import { getOpsHealth } from "@/app/actions/stats"
import { runStuckScan } from "@/app/actions/notifications"
import {
  formatCurrency,
  claimProgressLabels,
  type ClaimProgressStatus,
  type WorkflowClaim,
} from "@/lib/workflow-data"
import type { PaginatedResult } from "@/lib/pagination"

const viewTitles: Record<AdminView, { title: string; subtitle: string }> = {
  inbox: {
    title: "תיבת משימות",
    subtitle: "מה דורש טיפול עכשיו — לפי דחיפות ופעולה הבאה",
  },
  claims: {
    title: "תיקים",
    subtitle: "עיון וחיפוש בכל התביעות",
  },
  finance: {
    title: "כספים",
    subtitle: "התאמות סכומים, פילוח שותפים והתחייבויות",
  },
  partners: {
    title: "שותפים",
    subtitle: "מוסכים, סוכנויות ומשתמשי גישה",
  },
  settings: {
    title: "הגדרות",
    subtitle: "אוטומציה, webhooks ו-SLO",
  },
}

type AdminShellProps = {
  dashboardStats: ClaimsDashboardStats
  partnerOptions: { id: string; name: string }[]
  partnersSlot: React.ReactNode
  currentUser: { name: string; email: string; role: AppRole }
}

async function fetchFinanceClaims(): Promise<WorkflowClaim[]> {
  const res = await fetch("/api/claims?page=1&pageSize=100", { credentials: "same-origin" })
  if (!res.ok) return []
  const data = (await res.json()) as PaginatedResult<WorkflowClaim>
  return data.items
}

async function fetchInboxBadge(): Promise<number> {
  try {
    const health = await getOpsHealth()
    return health.backlog
  } catch {
    return 0
  }
}

export function AdminShell({ dashboardStats, partnerOptions, partnersSlot, currentUser }: AdminShellProps) {
  const isFullAdmin = currentUser.role === "admin"
  const [view, setView] = useState<AdminView>("inbox")
  const [mode, setMode] = useState<ClaimViewMode>("admin")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [partners, setPartners] = useState(partnerOptions)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeClaim, setActiveClaim] = useState<WorkflowClaim | null>(null)
  const [modalOriginView, setModalOriginView] = useState<AdminView | null>(null)
  const [inboxSegment, setInboxSegment] = useState<OpsInboxSegment>("all")
  const [inboxPage, setInboxPage] = useState(1)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { mutate: globalMutate } = useSWRConfig()

  const { data: financeClaims = [] } = useSWR(
    view === "finance" ? "finance-claims" : null,
    fetchFinanceClaims,
  )

  const { data: inboxBadge = 0 } = useSWR("inbox-badge", fetchInboxBadge, {
    refreshInterval: 60_000,
  })

  useEffect(() => {
    setPartners(partnerOptions)
  }, [partnerOptions])

  useEffect(() => {
    if (!activeId) {
      setActiveClaim(null)
      return
    }
    void getClaimByIdAction(activeId)
      .then((c) => setActiveClaim(c))
      .catch(() => setActiveClaim(null))
  }, [activeId])

  const isAdminMode = mode === "admin"

  function applyUpdated(updated: WorkflowClaim) {
    setActiveClaim(updated)
  }

  function reportError(context: string, err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[admin] ${context}:`, message)
    setActionError(message)
    setTimeout(() => setActionError(null), 6000)
  }

  function openClaim(
    claim: WorkflowClaim,
    originView: AdminView = view,
    preferredMode: ClaimViewMode = "admin",
  ) {
    setMode(preferredMode)
    setModalOriginView(originView)
    setActiveClaim(claim)
    setActiveId(claim.id)
  }

  function openClaimById(
    claimId: string,
    originView: AdminView = view,
    preferredMode: ClaimViewMode = "admin",
  ) {
    setMode(preferredMode)
    setModalOriginView(originView)
    setActiveId(claimId)
  }

  function closeModal() {
    setActiveId(null)
    setModalOriginView(null)
  }

  function backToInbox() {
    setView("inbox")
    closeModal()
  }

  async function setAmounts(claimId: string, requested: number, received: number) {
    if (!isFullAdmin) return
    try {
      applyUpdated(await setAmountsAction(claimId, requested, received))
    } catch (err) {
      reportError("setAmounts", err)
    }
  }

  async function toggleFunds(claimId: string) {
    if (!isFullAdmin) return
    try {
      applyUpdated(await toggleFundsAction(claimId))
    } catch (err) {
      reportError("toggleFunds", err)
    }
  }

  async function reconcile(claimId: string, received: number) {
    if (!isFullAdmin) return
    const base = activeClaim?.id === claimId ? activeClaim : await getClaimByIdAction(claimId)
    if (!base) return
    try {
      applyUpdated(await setAmountsAction(claimId, base.requestedAmount, received))
    } catch (err) {
      reportError("reconcile", err)
    }
  }

  async function generateReport(claim: WorkflowClaim) {
    try {
      const fresh = await getClaimByIdAction(claim.id)
      if (fresh) applyUpdated(fresh)
    } catch (err) {
      reportError("generateReport", err)
    }
  }

  async function refreshClaim(claimId: string) {
    try {
      const fresh = await getClaimByIdAction(claimId)
      if (fresh) applyUpdated(fresh)
    } catch (err) {
      reportError("refreshClaim", err)
    }
  }

  async function deleteClaim(claimId: string) {
    if (!isFullAdmin) return
    try {
      await deleteClaimAction(claimId)
      setActiveId(null)
    } catch (err) {
      reportError("deleteClaim", err)
    }
  }

  async function addContributor(claimId: string, name: string) {
    try {
      applyUpdated(await addClaimContributorAction(claimId, name))
    } catch (err) {
      reportError("addContributor", err)
      throw err
    }
  }

  async function removeContributor(claimId: string, name: string) {
    try {
      applyUpdated(await removeClaimContributorAction(claimId, name))
    } catch (err) {
      reportError("removeContributor", err)
    }
  }

  async function createClaim(data: NewClaimInput) {
    if (!isFullAdmin) return
    try {
      await createClaimAction(data)
    } catch (err) {
      reportError("createClaim", err)
      throw err
    }
  }

  async function confirmPayment(claimId: string) {
    try {
      applyUpdated(await confirmPaymentReceivedAction(claimId))
      await Promise.all([
        globalMutate((key) => Array.isArray(key) && key[0] === "ops-inbox"),
        globalMutate("inbox-badge"),
        globalMutate("ops-health"),
      ])
    } catch (err) {
      reportError("confirmPayment", err)
      throw err
    }
  }

  async function scanStuck() {
    setScanning(true)
    setScanMsg(null)
    try {
      const r = await runStuckScan()
      setScanMsg(
        r.created > 0
          ? `נמצאו ${r.created} תיקים תקועים — נשלחו התראות${r.emailed > 0 ? ` (${r.emailed} במייל)` : ""}.`
          : "לא נמצאו תיקים תקועים חדשים.",
      )
    } catch (err) {
      reportError("stuck scan", err)
      setScanMsg("סריקה נכשלה.")
    } finally {
      setScanning(false)
      setTimeout(() => setScanMsg(null), 6000)
    }
  }

  const meta = viewTitles[view]

  return (
    <div className="flex min-h-dvh bg-background">
      <AdminSidebar
        active={view}
        onNavigate={setView}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentUser={currentUser}
        userRole={currentUser.role}
        inboxBadge={inboxBadge}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-2 text-foreground hover:bg-muted lg:hidden"
            aria-label="פתיחת תפריט"
          >
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-foreground">{meta.title}</h1>
            <p className="hidden truncate text-sm text-muted-foreground sm:block">{meta.subtitle}</p>
          </div>

          <div
            className="inline-flex shrink-0 rounded-lg border border-border bg-secondary p-0.5"
            role="group"
            aria-label="מצב תצוגה"
          >
            <button
              type="button"
              onClick={() => setMode("admin")}
              aria-pressed={isAdminMode}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                isAdminMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">מצב ניהול</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("partner")}
              aria-pressed={!isAdminMode}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                !isAdminMode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">תצוגת שותף</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={scanStuck}
            disabled={scanning}
            aria-label="סריקת תיקים תקועים"
            title="סריקת תיקים תקועים (מעל 5 ימים)"
          >
            <RefreshCw className={cn("size-4", scanning && "animate-spin")} />
          </Button>

          <NotificationBell />

          {isFullAdmin && (
            <Button size="lg" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">תביעה חדשה</span>
              <span className="sm:hidden">חדש</span>
            </Button>
          )}
        </header>

        {scanMsg && (
          <div className="border-b border-border bg-primary/10 px-4 py-2 text-center text-xs font-medium text-foreground sm:px-6">
            {scanMsg}
          </div>
        )}

        {actionError && (
          <div
            className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-xs font-medium text-destructive sm:px-6"
            role="alert"
          >
            {actionError}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6">
          {view === "inbox" && (
            <div className="flex flex-col gap-8">
              <OpsHealthSummary />
              <OpsInbox
                segment={inboxSegment}
                page={inboxPage}
                onSegmentChange={setInboxSegment}
                onPageChange={setInboxPage}
                onOpenClaim={(id) => openClaimById(id, "inbox", "admin")}
              />
            </div>
          )}

          {view === "claims" && (
            <div className="flex flex-col gap-6">
              <section className="rounded-xl border border-border bg-card/50 px-4 py-3">
                <p className="text-sm font-medium text-foreground">עמוד תיקים הוא אזור עיון.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  העבודה התפעולית מתחילה ב`תיבת משימות`; כספים מרוכזים ב`כספים`.
                </p>
              </section>
              <WorkflowTable
                partnerOptions={partnerOptions}
                onOpen={(claim) => openClaim(claim, "claims", "partner")}
              />
            </div>
          )}

          {view === "finance" && isFullAdmin && (
            <div className="flex flex-col gap-6">
              <WorkflowSummary buckets={dashboardStats.financialBuckets} />
              <MatchingEngine
                claims={financeClaims}
                onSelect={(id) => openClaimById(id, "finance", "admin")}
                onReconcile={reconcile}
              />
              <FinanceBreakdown stats={dashboardStats} />
            </div>
          )}

          {view === "partners" && isFullAdmin && partnersSlot}

          {view === "settings" && <SettingsView isFullAdmin={isFullAdmin} />}
        </main>
      </div>

      <ClaimDetailModal
        claim={activeClaim}
        mode={mode}
        originView={modalOriginView}
        onClose={closeModal}
        onBackToInbox={modalOriginView === "inbox" ? backToInbox : undefined}
        onSetAmounts={isFullAdmin ? setAmounts : undefined}
        onToggleFunds={isFullAdmin ? toggleFunds : undefined}
        onGenerateReport={generateReport}
        onDeleteClaim={isFullAdmin ? deleteClaim : undefined}
        onAddContributor={addContributor}
        onRemoveContributor={removeContributor}
        onClaimRefresh={refreshClaim}
        onConfirmPayment={confirmPayment}
        canSendManualEmail={isFullAdmin}
      />

      {isFullAdmin && (
        <AddClaimDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onCreate={createClaim}
          partners={partners}
        />
      )}
    </div>
  )
}

function FinanceBreakdown({ stats }: { stats: ClaimsDashboardStats }) {
  const grandTotal =
    stats.byPartner.reduce((sum, p) => sum + p.totalRequested, 0) || 1

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-foreground">היקף לפי שותף</h2>
        </div>
        <div className="flex flex-col gap-4 p-4">
          {stats.byPartner.map((row) => {
            const pct = Math.round((row.totalRequested / grandTotal) * 100)
            return (
              <div key={row.partnerId}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.partnerName}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(row.totalRequested)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-foreground">התפלגות לפי סטטוס</h2>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {(["pending", "in_progress", "pending_resolution", "completed"] as ClaimProgressStatus[]).map(
            (status) => (
            <div key={status} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-muted-foreground">{claimProgressLabels[status]}</span>
              <span className="font-medium tabular-nums text-foreground">
                {stats.byProgress[status]} תיקים
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
