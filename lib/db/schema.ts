import { pgTable, text, timestamp, boolean, integer, numeric, unique, index } from "drizzle-orm/pg-core"

/** ILS money: numeric(14,2) mapped to JS number (agora-level precision). */
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" })

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  // RBAC: "admin" (internal AXIS staff) or "partner" (garage / agency)
  role: text("role").notNull().default("partner"),
  // For partner users: the partner account they belong to. Null for admins.
  partnerId: text("partnerId"),
  // Forces a password change on next login (new partner/sub-user onboarding).
  mustResetPassword: boolean("mustResetPassword").notNull().default(false),
  // Sub-user role within a partner org: "owner" (created by admin) or "member".
  partnerRole: text("partnerRole"),
  // Brute-force protection: consecutive failed password attempts.
  failedLoginAttempts: integer("failedLoginAttempts").notNull().default(0),
  // When set, credential sign-in is blocked until an admin unlocks the account.
  lockedAt: timestamp("lockedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// --- App tables ------------------------------------------------------------
// Partner (garage / agency) accounts onboarded by AXIS admins. Each partner
// maps to exactly one login user (user.partnerId === partner.id).

export const partner = pgTable("partner", {
  id: text("id").primaryKey(),
  businessName: text("businessName").notNull(),
  contactEmail: text("contactEmail").notNull(),
  // unique login reference generated at onboarding
  loginUsername: text("loginUsername").notNull().unique(),
  // "active" or "suspended"
  status: text("status").notNull().default("active"),
  // "garage" or "agency"
  type: text("type").notNull().default("garage"),
  // admin user id that created this partner
  createdBy: text("createdBy").notNull(),
  /** E.164 digits (9725…) for WhatsApp Intake sender → partner resolution. */
  whatsappPhone: text("whatsappPhone"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Claim: the core tenant-scoped record. `partnerId` is the isolation key —
// every partner-facing query MUST filter by it. Amounts are decimal shekels (2 dp).
export const claim = pgTable("claim", {
  id: text("id").primaryKey(), // e.g. "CLM-4821"
  clientName: text("clientName").notNull(),
  /** Permanent customer name captured at intake; clientName retained for compatibility. */
  customerName: text("customerName").notNull(),
  plate: text("plate").notNull(),
  carModel: text("carModel").notNull().default("—"),
  partnerId: text("partnerId").notNull(),
  currentStage: integer("currentStage").notNull().default(1),
  requestedAmount: money("requestedAmount").notNull().default(0),
  receivedAmount: money("receivedAmount").notNull().default(0),
  fundsReleased: boolean("fundsReleased").notNull().default(false),
  /** Set when staff manually confirms compensation received (Stage 6 gate). */
  paymentConfirmedAt: timestamp("paymentConfirmedAt"),
  // "open" | "closed"
  status: text("status").notNull().default("open"),
  // when the claim last entered its current stage — drives stuck detection
  stageEnteredAt: timestamp("stageEnteredAt").notNull().defaultNow(),
  createdBy: text("createdBy").notNull(),
  /** JSON string array of contributor display names (accountability trail). */
  contributors: text("contributors").notNull().default("[]"),
  /** Client mobile (E.164 digits) captured at WhatsApp / intake. */
  clientPhone: text("clientPhone"),
  /** "admin" | "whatsapp" — how the claim was opened. */
  intakeSource: text("intakeSource").notNull().default("admin"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// The 9-stage ledger, one row per (claim, stage). status is the state machine
// cell: "pending" | "in-progress" | "done". notes are internal (admin-only).
export const claimStage = pgTable(
  "claim_stage",
  {
    id: text("id").primaryKey(),
    claimId: text("claimId").notNull(),
    stage: integer("stage").notNull(),
    status: text("status").notNull().default("pending"),
    notes: text("notes").notNull().default(""),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    claimStageUnique: unique("claim_stage_claim_stage_unique").on(t.claimId, t.stage),
  }),
)

// Required intake documents per claim. Multiple file rows may share the same
// (claimId, kind) — e.g. several accident photos. partnerId is denormalized
// for tenant-scoped queries. status drives the garage task flow:
//   "pending"  – not yet provided
//   "missing"  – admin flagged as missing/insufficient
//   "uploaded" – a file exists, awaiting admin review
//   "approved" – admin approved the document
export const claimDocument = pgTable("claim_document", {
  id: text("id").primaryKey(),
  claimId: text("claimId").notNull(),
  partnerId: text("partnerId").notNull(),
  // Document kind: one of DOC_KINDS in lib/documents.ts (canonical claim intake kinds).
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  // Blob (private) pathname — never a public URL. Null until uploaded.
  blobPathname: text("blobPathname"),
  fileName: text("fileName"),
  fileSize: integer("fileSize"),
  contentType: text("contentType"),
  // admin note explaining why a doc was flagged missing
  note: text("note").notNull().default(""),
  uploadedBy: text("uploadedBy"),
  /**
   * IDP pilot (P2): JSON payload of extracted fields + per-field confidence.
   * Column name extracted_data per product convention.
   */
  extractedData: text("extracted_data"),
  // none | processing | ready | needs_review | failed | reviewed
  extractionStatus: text("extractionStatus").notNull().default("none"),
  extractionConfidence: integer("extractionConfidence"),
  extractionModel: text("extractionModel"),
  extractionError: text("extractionError"),
  extractionReviewedAt: timestamp("extractionReviewedAt"),
  extractionReviewedBy: text("extractionReviewedBy"),
  /** STP (P3): none | auto_verified | exception | chased */
  stpStatus: text("stpStatus").notNull().default("none"),
  stpReason: text("stpReason"),
  stpDecidedAt: timestamp("stpDecidedAt"),
  /** Draft PDF awaiting wet signature (e.g. demand letter). */
  draftBlobPathname: text("draftBlobPathname"),
  draftGeneratedAt: timestamp("draftGeneratedAt"),
  /** SHA-256 fingerprint of canonical draft content at generation time. */
  draftVersionHash: text("draftVersionHash"),
  /** null | pending_signature | verified */
  signatureStatus: text("signatureStatus"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/**
 * Async intake jobs (P1). Client uploads direct-to-Blob; a background finalize
 * step attaches the file to claim_document and syncs progress.
 * status: pending | uploading | finalizing | completed | failed
 */
export const documentJob = pgTable("document_job", {
  id: text("id").primaryKey(),
  claimId: text("claimId").notNull(),
  partnerId: text("partnerId").notNull(),
  kind: text("kind").notNull(),
  documentId: text("documentId"),
  status: text("status").notNull().default("pending"),
  // 0–100; client reports blob transfer progress, server sets 100 on complete.
  percent: integer("percent").notNull().default(0),
  fileName: text("fileName").notNull().default(""),
  fileSize: integer("fileSize"),
  contentType: text("contentType"),
  contentHash: text("contentHash"),
  blobPathname: text("blobPathname"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("maxAttempts").notNull().default(3),
  lastError: text("lastError"),
  // Client-supplied idempotency key (unique when set).
  clientKey: text("clientKey"),
  createdBy: text("createdBy").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// In-app + email alerts. `audience` routes visibility:
//   "admin"   -> visible to all AXIS admins (recipientPartnerId null)
//   "partner" -> visible only to users of recipientPartnerId (tenant-scoped)
// `dedupeKey` guarantees idempotent alert creation (one per stuck period / doc).
export const notification = pgTable("notification", {
  id: text("id").primaryKey(),
  audience: text("audience").notNull(), // "admin" | "partner"
  recipientPartnerId: text("recipientPartnerId"),
  claimId: text("claimId"),
  // "stuck_claim" | "missing_doc" | "doc_uploaded"
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  read: boolean("read").notNull().default(false),
  emailSent: boolean("emailSent").notNull().default(false),
  dedupeKey: text("dedupeKey").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Append-only financial audit trail. Rows are never updated or deleted.
export const financialTransaction = pgTable("financial_transaction", {
  id: text("id").primaryKey(),
  claimId: text("claimId").notNull(),
  partnerId: text("partnerId").notNull(),
  // "created" | "requested_set" | "received_set" | "funds_released" | "funds_held"
  kind: text("kind").notNull(),
  amount: money("amount").notNull().default(0),
  previousAmount: money("previousAmount"),
  note: text("note").notNull().default(""),
  performedBy: text("performedBy").notNull(),
  performedByName: text("performedByName").notNull().default(""),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/**
 * Append-only claim lifecycle / document audit trail (P0 STP foundation).
 * Types: doc_uploaded | doc_approved | doc_missing | doc_reset | doc_removed |
 *        doc_viewed | progress_synced
 */
export const claimEvent = pgTable("claim_event", {
  id: text("id").primaryKey(),
  claimId: text("claimId").notNull(),
  partnerId: text("partnerId").notNull(),
  type: text("type").notNull(),
  actorUserId: text("actorUserId"),
  actorRole: text("actorRole"),
  documentId: text("documentId"),
  documentKind: text("documentKind"),
  // JSON string of extra context (counts, note snippet, etc.)
  meta: text("meta").notNull().default("{}"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

/**
 * Resend inbound messages. Attachment files are staged separately and are
 * never promoted into claim_document without an explicit admin action.
 */
export const inboundEmail = pgTable(
  "inbound_email",
  {
    id: text("id").primaryKey(),
    providerEventId: text("providerEventId").notNull(),
    providerEmailId: text("providerEmailId").notNull(),
    providerMessageId: text("providerMessageId"),
    claimId: text("claimId"),
    partnerId: text("partnerId"),
    fromAddress: text("fromAddress").notNull(),
    toAddresses: text("toAddresses").notNull().default("[]"),
    ccAddresses: text("ccAddresses").notNull().default("[]"),
    subject: text("subject").notNull().default(""),
    textBody: text("textBody").notNull().default(""),
    status: text("status").notNull().default("processing"),
    error: text("error"),
    receivedAt: timestamp("receivedAt").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    providerEventUnique: unique("inbound_email_provider_event_unique").on(t.providerEventId),
    providerEmailUnique: unique("inbound_email_provider_email_unique").on(t.providerEmailId),
    claimReceivedIdx: index("inbound_email_claim_received_idx").on(t.claimId, t.receivedAt),
  }),
)

export const inboundEmailAttachment = pgTable(
  "inbound_email_attachment",
  {
    id: text("id").primaryKey(),
    inboundEmailId: text("inboundEmailId").notNull(),
    providerAttachmentId: text("providerAttachmentId").notNull(),
    fileName: text("fileName").notNull(),
    fileSize: integer("fileSize"),
    contentType: text("contentType").notNull().default("application/octet-stream"),
    contentDisposition: text("contentDisposition"),
    contentId: text("contentId"),
    blobPathname: text("blobPathname"),
    status: text("status").notNull().default("processing"),
    rejectionReason: text("rejectionReason"),
    savedDocumentId: text("savedDocumentId"),
    savedKind: text("savedKind"),
    savedBy: text("savedBy"),
    savedAt: timestamp("savedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => ({
    providerAttachmentUnique: unique("inbound_attachment_provider_unique").on(
      t.inboundEmailId,
      t.providerAttachmentId,
    ),
    emailIdx: index("inbound_attachment_email_idx").on(t.inboundEmailId),
  }),
)

/** Outbound webhook subscriptions (P4). events: JSON string[] of event names. */
export const webhookEndpoint = pgTable("webhook_endpoint", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").notNull().default("[]"),
  active: boolean("active").notNull().default(true),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

/** Delivery attempts for webhook events (P4). */
export const webhookDelivery = pgTable("webhook_delivery", {
  id: text("id").primaryKey(),
  endpointId: text("endpointId").notNull(),
  event: text("event").notNull(),
  payload: text("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("lastError"),
  responseStatus: integer("responseStatus"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  deliveredAt: timestamp("deliveredAt"),
})

/** Rolling SLO metric samples (P4). */
export const sloSnapshot = pgTable("slo_snapshot", {
  id: text("id").primaryKey(),
  metric: text("metric").notNull(),
  value: numeric("value", { precision: 14, scale: 4, mode: "number" }).notNull(),
  unit: text("unit").notNull().default("ms"),
  meta: text("meta").notNull().default("{}"),
  recordedAt: timestamp("recordedAt").notNull().defaultNow(),
})
