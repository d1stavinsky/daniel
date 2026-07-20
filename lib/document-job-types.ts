import type { DocKind } from "@/lib/documents"

/** Client-safe async intake job view (no server imports). */
export type DocumentJobStatus = "pending" | "uploading" | "finalizing" | "completed" | "failed"

export type DocumentJobView = {
  id: string
  claimId: string
  partnerId: string
  kind: DocKind
  documentId: string | null
  status: DocumentJobStatus
  percent: number
  fileName: string
  fileSize: number | null
  contentType: string | null
  blobPathname: string | null
  lastError: string | null
  attempts: number
  maxAttempts: number
  canRetry: boolean
  updatedAt: string
  createdAt: string
}
