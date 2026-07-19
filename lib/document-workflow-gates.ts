import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { claimDocument } from "@/lib/db/schema"
import {
  DOC_KINDS,
  REQUIRED_DOCS,
  docKindLabels,
  docKindWorkflowStage,
  type DocKind,
} from "@/lib/documents"
import {
  isAttorneySignatureVerified,
  requiresAttorneySignature,
} from "@/lib/demand-letter-shared"

type ValidationDocRow = {
  kind: string
  status: string
  blobPathname: string | null
  stpStatus: string | null
  signatureStatus?: string | null
}

export function isValidatedDocumentRow(row: ValidationDocRow): boolean {
  if (!row.blobPathname) return false
  if (!(row.status === "approved" || row.stpStatus === "auto_verified")) return false
  // Signature-required docs only count when wet signature is verified.
  if (requiresAttorneySignature(row.kind) && !isAttorneySignatureVerified(row.signatureStatus)) {
    return false
  }
  return true
}

export function validatedDocKindsFromRows(rows: ValidationDocRow[]): Set<DocKind> {
  const byKind = new Map<DocKind, ValidationDocRow[]>()
  for (const row of rows) {
    if (!DOC_KINDS.includes(row.kind as DocKind)) continue
    const kind = row.kind as DocKind
    const list = byKind.get(kind) ?? []
    list.push(row)
    byKind.set(kind, list)
  }

  const out = new Set<DocKind>()
  for (const kind of DOC_KINDS) {
    const rowsForKind = byKind.get(kind) ?? []
    const withFile = rowsForKind.filter((row) => row.blobPathname)
    if (withFile.length > 0 && withFile.every(isValidatedDocumentRow)) {
      out.add(kind)
    }
  }
  return out
}

export function countValidatedDocKindsFromRows(rows: ValidationDocRow[]): number {
  return validatedDocKindsFromRows(rows).size
}

export async function countValidatedDocs(claimId: string): Promise<number> {
  const rows = await db
    .select({
      kind: claimDocument.kind,
      status: claimDocument.status,
      blobPathname: claimDocument.blobPathname,
      stpStatus: claimDocument.stpStatus,
      signatureStatus: claimDocument.signatureStatus,
    })
    .from(claimDocument)
    .where(and(eq(claimDocument.claimId, claimId), inArray(claimDocument.kind, DOC_KINDS)))

  return countValidatedDocKindsFromRows(rows)
}

export async function assertPreviousWorkflowStagesValidated(
  claimId: string,
  targetKind: DocKind,
): Promise<void> {
  const targetStage = docKindWorkflowStage[targetKind]
  if (!targetStage || targetStage <= 2) return

  const priorRequired = REQUIRED_DOCS.filter((doc) => doc.workflowStage < targetStage)
  if (priorRequired.length === 0) return

  const rows = await db
    .select({
      kind: claimDocument.kind,
      status: claimDocument.status,
      blobPathname: claimDocument.blobPathname,
      stpStatus: claimDocument.stpStatus,
      signatureStatus: claimDocument.signatureStatus,
    })
    .from(claimDocument)
    .where(and(eq(claimDocument.claimId, claimId), inArray(claimDocument.kind, DOC_KINDS)))

  const validated = validatedDocKindsFromRows(rows)
  const firstMissing = priorRequired.find((doc) => !validated.has(doc.kind))
  if (!firstMissing) return

  throw new Error(
    `לא ניתן להעלות את "${docKindLabels[targetKind]}" לפני אימות מסמכי שלבים קודמים. חסר אימות: ${firstMissing.label}.`,
  )
}
