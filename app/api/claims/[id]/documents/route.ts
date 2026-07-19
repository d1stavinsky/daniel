import { type NextRequest, NextResponse } from "next/server"
import { findClaimAccess } from "@/lib/tenant"
import { ensureDocRows, listClaimDocuments } from "@/lib/claim-documents"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * JSON list of claim documents. Prefer this over SWR→server-action for the
 * documents panel (P0) — lighter than an RSC action POST.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: claimId } = await context.params
    if (!claimId) {
      return NextResponse.json({ error: "Claim id required" }, { status: 400 })
    }

    const access = await findClaimAccess(claimId)
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (access.user.role === "admin" || access.user.role === "support") {
      await ensureDocRows(access.claimId, access.partnerId)
    }

    const docs = await listClaimDocuments(access.claimId, access.partnerId, {
      includeExtraction: access.user.role === "admin",
    })
    return NextResponse.json({ docs })
  } catch (err) {
    console.error("[api/docs] list failed:", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 })
  }
}
