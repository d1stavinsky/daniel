"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  AlertTriangle,
  Download,
  Eye,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  saveInboundAttachmentToClaim,
  type SaveInboundAttachmentResult,
} from "@/app/actions/inbound-communication"
import { DOC_KINDS, docKindLabels, type DocKind } from "@/lib/documents"

type InboundAttachmentView = {
  id: string
  fileName: string
  fileSize: number | null
  contentType: string
  status: string
  rejectionReason: string | null
  savedDocumentId: string | null
  savedKind: string | null
  savedAt: string | null
  hasFile: boolean
}

type InboundEmailView = {
  id: string
  fromAddress: string
  toAddresses: string[]
  ccAddresses: string[]
  subject: string
  textBody: string
  status: string
  error: string | null
  receivedAt: string
  attachments: InboundAttachmentView[]
}

type CommunicationsView = {
  claim: {
    id: string
    customerName: string
  }
  emails: InboundEmailView[]
}

async function fetchCommunications(claimId: string): Promise<CommunicationsView> {
  const response = await fetch(`/api/claims/${encodeURIComponent(claimId)}/communications`, {
    credentials: "same-origin",
  })
  if (!response.ok) throw new Error("טעינת התכתובות נכשלה.")
  const data = (await response.json()) as Partial<CommunicationsView>
  return {
    claim: data.claim ?? { id: claimId, customerName: "" },
    emails: data.emails ?? [],
  }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ClaimCommunications({
  claimId,
  onDocumentsChanged,
}: {
  claimId: string
  onDocumentsChanged?: () => Promise<void> | void
}) {
  const { data, error, isLoading, mutate } = useSWR<CommunicationsView>(
    ["claim-communications", claimId],
    () => fetchCommunications(claimId),
    { shouldRetryOnError: false },
  )
  const [selectedKinds, setSelectedKinds] = useState<Record<string, DocKind>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmReplaceId, setConfirmReplaceId] = useState<string | null>(null)
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(null)

  async function saveAttachment(attachment: InboundAttachmentView) {
    const kind = selectedKinds[attachment.id]
    if (!kind || busyId) return
    setBusyId(attachment.id)
    setErrors((previous) => ({ ...previous, [attachment.id]: "" }))
    try {
      const result: SaveInboundAttachmentResult = await saveInboundAttachmentToClaim({
        attachmentId: attachment.id,
        kind,
        replaceExisting: confirmReplaceId === attachment.id,
      })
      if (!result.ok) {
        setErrors((previous) => ({ ...previous, [attachment.id]: result.error }))
        if (result.requiresConfirmation) setConfirmReplaceId(attachment.id)
        return
      }
      setConfirmReplaceId(null)
      setEditingAttachmentId(null)
      await mutate()
      await onDocumentsChanged?.()
    } catch (saveError) {
      setErrors((previous) => ({
        ...previous,
        [attachment.id]:
          saveError instanceof Error ? saveError.message : "שמירת הצרופה נכשלה.",
      }))
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        טוען תכתובות…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        טעינת התכתובות הנכנסות נכשלה.
      </div>
    )
  }

  if (!data?.emails.length) {
    const linkedCustomerName = data?.claim.customerName?.trim() || "לקוח ללא שם"
    const linkedClaimId = data?.claim.id || claimId
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
        <Inbox className="size-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-foreground">
          אין תכתובות נכנסות עבור {linkedCustomerName}
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          מייל שמכיל את מספר התיק {linkedClaimId} או שם לקוח תואם יופיע כאן לאחר קליטתו.
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {data.emails.map((email) => (
        <li key={email.id} className="rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Mail className="size-4 shrink-0 text-gold" aria-hidden="true" />
                <span className="truncate">{email.subject || "ללא נושא"}</span>
              </h3>
              <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
                {email.fromAddress}
              </p>
            </div>
            <time className="shrink-0 text-[11px] text-muted-foreground">
              {new Intl.DateTimeFormat("he-IL", {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(email.receivedAt))}
            </time>
          </div>

          {email.textBody && (
            <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary/40 p-3 text-sm leading-6 text-foreground">
              {email.textBody}
            </div>
          )}

          {email.attachments.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Paperclip className="size-3.5" aria-hidden="true" />
                צרופות ({email.attachments.length})
              </h4>
              <ul className="space-y-2">
                {email.attachments.map((attachment) => {
                  const saved = attachment.status === "saved"
                  const ready = attachment.status === "pending" && attachment.hasFile
                  const confirming = confirmReplaceId === attachment.id
                  return (
                    <li
                      key={attachment.id}
                      className="rounded-lg border border-border/80 bg-background/60 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {attachment.fileName}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {attachment.contentType}
                            {attachment.fileSize ? ` · ${formatBytes(attachment.fileSize)}` : ""}
                          </p>
                        </div>

                        {attachment.hasFile && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                window.open(
                                  `/api/inbound-attachments/file?id=${encodeURIComponent(attachment.id)}`,
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                              }
                            >
                              <Eye className="size-3.5" />
                              צפייה
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                window.location.href = `/api/inbound-attachments/file?id=${encodeURIComponent(attachment.id)}&download=1`
                              }}
                            >
                              <Download className="size-3.5" />
                              הורדה
                            </Button>
                          </>
                        )}
                      </div>

                      {saved ? (
                        <p className="mt-2 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700">
                          נשמר בתיק כסוג:{" "}
                          {docKindLabels[attachment.savedKind as DocKind] || attachment.savedKind}
                        </p>
                      ) : ready ? (
                        editingAttachmentId === attachment.id ? (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <select
                              value={selectedKinds[attachment.id] ?? ""}
                              onChange={(event) => {
                                setSelectedKinds((previous) => ({
                                  ...previous,
                                  [attachment.id]: event.target.value as DocKind,
                                }))
                                setConfirmReplaceId(null)
                                setErrors((previous) => ({ ...previous, [attachment.id]: "" }))
                              }}
                              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none focus:border-gold"
                              aria-label={`בחירת סוג מסמך עבור ${attachment.fileName}`}
                              autoFocus
                            >
                              <option value="">בחירת סוג מסמך…</option>
                              {DOC_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                  {docKindLabels[kind]}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant={confirming ? "destructive" : "outline"}
                              disabled={!selectedKinds[attachment.id] || busyId === attachment.id}
                              onClick={() => void saveAttachment(attachment)}
                            >
                              {busyId === attachment.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : confirming ? (
                                <AlertTriangle className="size-3.5" />
                              ) : (
                                <Save className="size-3.5" />
                              )}
                              {confirming ? "אישור החלפת המסמך" : "שמירה בסוג הנבחר"}
                            </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busyId === attachment.id}
                            onClick={() => {
                              setEditingAttachmentId(null)
                              setConfirmReplaceId(null)
                              setErrors((previous) => ({ ...previous, [attachment.id]: "" }))
                            }}
                          >
                            ביטול
                          </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-3"
                            onClick={() => {
                              setEditingAttachmentId(attachment.id)
                              setConfirmReplaceId(null)
                              setErrors((previous) => ({ ...previous, [attachment.id]: "" }))
                            }}
                          >
                            <Save className="size-3.5" />
                            שמירה בתיק
                          </Button>
                        )
                      ) : (
                        <p className="mt-2 text-xs text-destructive">
                          {attachment.rejectionReason || "הצרופה אינה זמינה לשמירה."}
                        </p>
                      )}

                      {errors[attachment.id] && (
                        <p className="mt-2 text-xs text-destructive" role="alert">
                          {errors[attachment.id]}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
