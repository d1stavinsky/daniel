"use server"

/**
 * Thin re-exports — prefer `@/app/actions/stats` for new UI code.
 * Kept so existing `/api/admin/*` imports keep working.
 * Types: import from `@/lib/ops/next-action` (avoid re-exporting types from "use server").
 */
export {
  getOpsInbox,
  getOpsHealth,
  getOpsHealthStats,
  type OpsInboxFilters,
  type OpsHealth,
  type OpsHealthStats,
} from "@/app/actions/stats"
