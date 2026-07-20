# Business Process: Auto Claims Management

## Workflow Stages

1. **Intake** — Customer/Garage contact & Data collection (web form **or** WhatsApp `קליטה [phone] [plate] [customer name]`).
2. **Setup** — Power of Attorney (POA) + Consent form generation & remote signature.
3. **Investigation** — Damage assessment (Shamai report), Garage invoice, Photos, Attorney Fee invoice.
4. **Demand** — Demand letter issuance & submission to 3rd party Insurance.
5. **Tracking** — Status monitoring, handling missing docs (medical/history).
6. **Resolution** — Compensation verification → Payment reconciliation → Final settlement mail to client/garage.

---

## Stage → Document Mapping

| Stage | Required Documents (`DocKind`) |
|---|---|
| Setup (2) | `power_of_attorney`, `insurance_policy`, `insurance_to_trust_consent`, `trust_account_form`, `driver_license_client`, `owner_id`, `driver_license_third_party`, `vehicle_license_third_party`, `non_submission_confirmation`, `vehicle_license_client` |
| Investigation (3) | `appraiser_report`, `repair_invoice`, `accident_photos`, `attorney_fee_invoice` |
| Demand (4) | `demand_letter` |
| Tracking (5) | Status monitoring and follow-up; no additional mandatory document kind |
| Resolution (6) | All 15 docs verified; `receivedAmount > 0`; manual `paymentConfirmedAt`; then `status = closed` |

The system enforces progress through document validation counts
(see `lib/claim-progress.ts`). All 15 mandatory `DOC_KINDS` must reach
`approved` or `auto_verified` before a claim enters **Pending Resolution**.
Claims **must not** auto-close when documents are validated — staff must
explicitly confirm payment via `confirmPaymentReceived` (sets
`paymentConfirmedAt`), which is the only path to `completed` / `closed`.

Documents are stage-gated at upload time: Stage 3 documents cannot be uploaded
until every Stage 2 document is validated, and Stage 4 documents cannot be
uploaded until every Stage 2 and Stage 3 document is validated.

---

## Internal Stage Ledger (9 steps → 6 business stages mapping)

The DB stores a finer 9-step operational ledger (`claim_stage` table, `STAGES` in
`lib/workflow-data.ts`). The mapping to business stages:

| DB stages | Business stage |
|---|---|
| 1 — איסוף נתונים | **1 — Intake** |
| 2 — חתימת מסמכים | **2 — Setup** |
| 3 — טופס אי-הגשה | **2 — Setup** _(non-submission confirmation)_ |
| 4 — שמאות | **3 — Investigation** |
| 5 — מכתב דרישה | **4 — Demand** |
| 6 — הגשת תביעה | **4 — Demand** _(filing)_ |
| 7 — מעקב וטיפול | **5 — Tracking** |
| 8 — התאמה ותשלום | **6 — Resolution** |
| 9 — סגירת תיק | **6 — Resolution** _(closed)_ |

---

## System Logic (Cursor Rules)

- **Every claim must have a status** mapped to one of the 6 stages above via its
  `progressStatus` (`pending` → Intake/Setup, `in_progress` → Investigation–Tracking,
  `pending_resolution` → Resolution (docs validated, awaiting payment confirm),
  `completed` → Resolution closed).

- **Next Action logic must prioritize tasks based on missing requirements:**

  | Condition | Next Action | Business Stage blocked |
  |---|---|---|
  | Demand letter Internal Audit (amount vs appraisal) | `internal_audit` → "Internal Audit" | 4 |
  | STP exception / AI mismatch on any doc | `stp_exception` → "Review Mismatch" | 3 or 4 (doc can't progress) |
  | Doc uploaded but not yet approved | `pending_approval` → "Approve" | 3, 4, or 5 |
  | Demand draft awaiting wet signature | `pending_signature` → "Mark Signed & Upload" | 4 |
  | Required doc kind absent | `missing_docs` → "Request Docs" | 2, 3, or 5 |
  | Investigation/Demand idle ≥ `SLA_BREACH_DAYS` (7 d) | SLA overlay (`slaBreached`) on current action | 3 or 4 |
  | No progress for `STUCK_DAYS` (5 d) | `stuck` → "Investigate Stuck" | any |
  | 15/15 docs validated, payment not confirmed | `pending_resolution` → "Confirm Payment" | 6 |
  | `receivedAmount < requestedAmount` | `finance_gap` → "Match Amounts" | 6 |
  | Payment confirmed + all docs verified | `none` → excluded from inbox | complete |

- **Demand letter signature gate:** `demand_letter` requires `signatureStatus = verified`
  (set only after signed upload passes the draft version-hash check). Manual
  `approveDoc` / exception approve / HITL confirm **cannot** approve or validate
  a demand letter while signature is missing or pending.

- **UI must reflect the current workflow stage.** The Inbox chip filters map
  directly: "Review" = stage-4/Demand blockers; "Missing Docs" = stage-2/3/5
  blockers; "ממתין לסגירה" = stage-6 pending resolution; "High Urgency" = anything
  scoring ≥ 80 (STP exceptions + pending approval aged > 2 h).

- **Financial data (Remittance, Fees, Deductions) is secondary to operational
  stage progression.** Financial KPIs live exclusively on the `כספים` view.
  The Inbox header shows only ops KPIs: STP %, exception backlog, avg aging days.

---

## Guards: Changes That Risk Breaking Stages 4–6

> Any feature request that touches the following must be flagged before
> implementation:

| Area | Risk |
|---|---|
| Removing or renaming a `DocKind` | Breaks `missing_docs` detection for stages 3–5 |
| Changing `REQUIRED_DOCS` count | Changes the 15-doc gate that unlocks Resolution |
| Altering `approveExceptionDocument` / `clearStpException` | Directly affects stage-4 Demand doc verification |
| Modifying `stpStatus` or `extractionStatus` transitions | May silently mis-classify docs as verified in stage 3 |
| Changing `fundsReleased` toggle behavior | Affects the stage-6 settlement signal (secondary to payment confirm) |
| Removing `paymentConfirmedAt` or auto-closing on doc count | Breaks Stage 6 resolution gate |
| Removing stage-gated upload checks | Allows higher-stage docs to bypass Setup/Investigation validation |
| Altering `STUCK_DAYS` | Changes when stage-5 Tracking items surface in Inbox |
| Adding a new `NextActionKind` without a stage annotation | Will produce unclassified inbox rows with no stage context |

---

## Ownership

This file is the canonical reference for all business process decisions in this
codebase. Every PR that modifies `lib/ops/next-action.ts`, `lib/documents.ts`,
`lib/workflow-data.ts`, or any Inbox/stats action must cross-reference these
stages and update this file if the process changes.
