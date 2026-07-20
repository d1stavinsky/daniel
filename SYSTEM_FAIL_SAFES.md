# SYSTEM_FAIL_SAFES — Red Team Risk Registry

**Purpose:** Identify human-in-the-loop bottlenecks in the AXIS claims workflow, define failure scenarios, and specify **blocker logic** (fail-safes) that prevent silent stage-skipping or premature closure.

**Scope:** 18-step operational workflow (Red Team model), cross-referenced to [BUSINESS_PROCESS.md](./BUSINESS_PROCESS.md) and the 15 mandatory `DocKind` gates in `lib/documents.ts`.

**Status:** Analysis & registry only — **no code implemented** from this document unless explicitly approved.

**Legend:**
- **Implemented** — exists in codebase today.
- **Proposed** — recommended fail-safe; not yet built.
- **Partial** — some protection exists but gaps remain.

---

## 1. The 18-Step Operational Workflow (Red Team Canonical Model)

The 18 steps decompose the 6 business stages and 9 DB ledger stages into **operator-visible checkpoints**, including offline human actions (print → sign → scan) that the system cannot observe directly.

| Step | Label | Business Stage | Primary Anchor |
|---:|---|---|---|
| 1 | Intake — Contact & case acceptance | 1 — Intake | Claim eligibility |
| 2 | Intake — Data capture & claim opened | 1 — Intake | `createClaim` |
| 3 | Setup — Legal package prepared (POA, consent, trust forms) | 2 — Setup | Doc generation / templates |
| 4 | **Attorney / Client Signature — Setup documents (wet sign)** | 2 — Setup | `power_of_attorney`, `insurance_to_trust_consent`, `trust_account_form` |
| 5 | Setup — Client identity bundle | 2 — Setup | `owner_id`, `driver_license_client`, `vehicle_license_client` |
| 6 | Setup — Third-party identity bundle | 2 — Setup | `driver_license_third_party`, `vehicle_license_third_party` |
| 7 | Setup — Non-submission confirmation | 2 — Setup | `non_submission_confirmation` |
| 8 | Investigation — Appraiser report | 3 — Investigation | `appraiser_report` |
| 9 | Investigation — Garage repair invoice | 3 — Investigation | `repair_invoice` |
| 10 | Investigation — Accident photos | 3 — Investigation | `accident_photos` |
| 11 | Investigation — Attorney fee invoice | 3 — Investigation | `attorney_fee_invoice` |
| 12 | Demand — Demand letter drafted | 4 — Demand | `demand_letter` (draft) |
| 13 | **Attorney Signature — Demand letter (wet sign)** | 4 — Demand | `demand_letter` (signed scan) |
| 14 | Demand — Submission to insurer | 4 — Demand | Ledger stage 6 (הגשת תביעה) |
| 15 | Tracking — Insurer follow-up & supplemental docs | 5 — Tracking | `missing_docs`, `stuck` |
| 16 | Resolution — Compensation received (amount match) | 6 — Resolution | `receivedAmount` vs `requestedAmount` |
| 17 | Resolution — Funds release decision | 6 — Resolution | `fundsReleased` |
| 18 | Resolution — Manual payment confirmation & close | 6 — Resolution | `paymentConfirmedAt` → `closed` |

**Critical human bottlenecks (Steps 4 & 13):** Offline signature cycles where work leaves the system between "document ready" and "validated upload."

---

## 2. Attorney Signature Gap — Deep Analysis

### 2.1 Why This Is a Critical Bottleneck

Steps **4** and **13** require a document to be **printed, physically signed (often by attorney and/or client), scanned, and re-uploaded**. The system only sees the final file — not the offline queue.

| Signature Step | Documents | Downstream Blocked |
|---|---|---|
| Step 4 | POA, trust consent, trust account form | All Stage 3 Investigation uploads |
| Step 13 | Demand letter | Insurer submission (Step 14), entire Tracking/Resolution chain |

### 2.2 Failure Scenarios

| Scenario | Process Impact | Current System Behavior | Risk Level |
|---|---|---|---|
| **Attorney unavailable** | Signed scan never produced; claim stalls offline | No `ready_for_signature` state; claim may show `missing_docs` only after timeout (`stuck` at 5 days) | **Critical** |
| **Poor scan quality** (blurry, cropped, low DPI) | Signature/date illegible; insurer may reject | Upload accepted → `pending_approval` or `stp_exception` if IDP/STP confidence low (**Partial**) | **High** |
| **Wrong document version signed** | Legally invalid POA or demand; insurer rejects filing | No draft/version hash compare; any PDF upload can pass if visually similar enough for manual approve | **Critical** |
| **Unsigned or partially signed upload** | Invalid authorization | STP may not detect missing signature field unless IDP pilot covers kind (**Partial**) | **High** |
| **Correct doc signed but wrong claim** | Cross-claim contamination | Tenant scoping prevents cross-partner access (**Implemented**); no plate/client cross-check on upload (**Gap**) | **Medium** |
| **Scan uploaded before prior stages validated** | Stage skip | Stage-gated upload blocks Stage 3/4 until prior docs validated (**Implemented**) | Low (mitigated) |
| **Staff approves bad scan manually** | Bad doc enters validated set | `approveDoc` / `approveExceptionDocument` bypass STP (**Partial** — audit trail via `claim_event`) | **High** |

### 2.3 Proposed Fail-Safes for Attorney Signature (Registry Logic)

These are **design proposals** — not implemented unless marked otherwise.

#### A. `ready_for_signature` Inbox State (Proposed)

| Field | Value |
|---|---|
| **Trigger** | Staff marks doc kind as "sent for signature" OR system generates PDF and sets sub-status |
| **Inbox action** | New `NextActionKind`: `ready_for_signature` (urgency ~70, stage 2 or 4) |
| **Segment** | New chip: **"ממתין לחתימה"** |
| **Exit condition** | Signed scan uploaded **and** validated (`approved` / `auto_verified`) |
| **Blocker** | While any required signature doc is `ready_for_signature`, **Demand stage upload remains locked** even if other Investigation docs are validated |

#### B. Demand Stage Lock Until Signed Demand Verified (Proposed)

| Rule | Blocker Logic |
|---|---|
| `demand_letter` upload | Block until: (1) all Stage 2+3 docs validated **and** (2) demand draft exists with `signatureStatus = pending` cleared |
| Step 14 (filing) | Block ledger stage 6 `done` until `demand_letter` validated |
| Alert | Admin notification + email if `ready_for_signature` > **48h** (configurable SLA) |

#### C. Version Integrity (Proposed)

| Check | Blocker Logic |
|---|---|
| Draft hash stored at generation time | On upload, compare file hash to latest draft; mismatch → `stp_exception` "Wrong version signed" |
| Re-generation | Incrementing `draftVersion`; old scans auto-rejected |

#### D. Signature & Quality Detection (Partial → Proposed)

| Check | Today | Proposed |
|---|---|---|
| Low confidence / failed extraction | `stp_exception` (**Partial**) | Mandatory signature-field IDP for POA + demand_letter |
| Illegible scan | Manual review only | Auto-reject below DPI/confidence threshold with partner resubmit task |

---

## 3. Master Risk Registry (18 Steps)

| Step | Stage | Potential Human / Process Failure | System Fail-Safe (Blocker Logic) | Status |
|---:|---|---|---|---|
| 1 | Intake — Contact | Wrong client taken on; duplicate claim for same accident | Duplicate plate + date window check on `createClaim` (**Proposed**); partner notification on duplicate | Proposed |
| 2 | Intake — Data capture | Invalid plate, wrong amounts, wrong partner | Zod schema: plate 7–8 digits, positive `requestedAmount`, partner required (**Implemented**) | Implemented |
| 3 | Setup — Package prepared | Wrong template / outdated legal wording used | Template version tag on generated PDF; block send if template retired (**Proposed**) | Proposed |
| 4 | **Attorney Signature (Setup)** | Attorney unavailable; poor scan; wrong version; unsigned upload | **`ready_for_signature` inbox state**; 48h SLA alert; draft hash compare; signature IDP gate; block Stage 3 uploads until POA + consent + trust form **validated** (**Partial** — upload gate only) | **Critical gap** |
| 5 | Setup — Client IDs | Expired license; wrong person; photo of screen not document | IDP field extraction + `stp_exception` on mismatch; manual approve required (**Partial**) | Partial |
| 6 | Setup — Third-party IDs | Missing 3rd party; forged docs | `missing_docs` until uploaded; STP cross-field checks vs claim plate/client (**Partial**) | Partial |
| 7 | Setup — Non-submission | Form not filed with court/insurer when required | No external filing confirmation tracked (**Gap**); `missing_docs` + manual approve only | Gap |
| 8 | Investigation — Appraisal | Delayed appraiser; report for wrong vehicle | Stage 3 upload blocked until Stage 2 validated (**Implemented**); `missing_docs` / `stuck` | Partial |
| 9 | Investigation — Invoice | Inflated garage invoice; wrong VAT | STP amount cross-check vs appraisal (**Proposed**); `stp_exception` | Proposed |
| 10 | Investigation — Photos | Insufficient angles; wrong accident | Min photo count rule (**Proposed**); manual approve (**Partial**) | Partial |
| 11 | Investigation — Fee invoice | Fee invoice before work complete | Upload allowed but validation requires staff approve (**Partial**); blocks `pending_resolution` until validated | Partial |
| 12 | Demand — Draft | Demand issued with wrong amounts/dates | Draft generated from claim fields; edit audit trail (**Proposed**) | Proposed |
| 13 | **Attorney Signature (Demand)** | Attorney unavailable; wrong version signed; illegible scan | **`ready_for_signature` + Demand lock**; hash compare to draft; block Step 14 until `demand_letter` validated; 48h alert (**Proposed**) | **Critical gap** |
| 14 | Demand — Filing | Filed before signed demand attached; filed to wrong insurer | Block filing ledger `done` until demand validated (**Proposed**); insurer ID field required (**Proposed**) | Proposed |
| 15 | Tracking — Follow-up | Insurer requests supplemental docs; operator forgets | `missing_docs` + `markDocMissing` partner task (**Implemented**); `stuck` after 5 days (**Implemented**) | Partial |
| 16 | Resolution — Amount match | Partial payment recorded as full; wrong amount entered | `finance_gap` when `received < requested` (**Implemented**); cannot confirm payment with `receivedAmount = 0` (**Implemented**) | Implemented |
| 17 | Resolution — Funds release | Funds released before payment verified | `fundsReleased` toggle is manual (**Implemented**); independent of close gate — ops policy required (**Partial**) | Partial |
| 18 | Resolution — Close | Auto-close on doc completion; close without payment | **`paymentConfirmedAt` required**; DB CHECK `closed → paymentConfirmedAt NOT NULL` (**Implemented**); modal checkbox + inbox confirm (**Implemented**) | Implemented |

---

## 4. Human-in-the-Loop Bottleneck Summary

Steps with **offline or judgment-dependent** work that the system cannot fully automate:

| Step | Bottleneck Type | Severity | Priority Fail-Safe |
|---:|---|---|---|
| 4 | Wet signature (Setup) | **Critical** | `ready_for_signature` + version hash + signature IDP |
| 5–6 | Identity document authenticity | High | IDP + STP cross-check vs claim metadata |
| 7 | External filing confirmation | Medium | Optional filing receipt doc kind |
| 8–11 | Third-party turnaround (appraiser, garage) | High | SLA alerts + `stuck` (exists); partner chase (STP chase exists) |
| 10 | Photo completeness judgment | Medium | Min-count + quality threshold |
| 12–13 | Demand draft + attorney sign | **Critical** | Draft registry + Demand lock + hash compare |
| 14 | Insurer submission proof | High | Filing receipt / confirmation number field |
| 15 | Open-ended insurer correspondence | High | `missing_docs` loop (exists) |
| 16–18 | Finance judgment & bank confirmation | High | Payment confirm gate (exists); funds release policy |

---

## 5. Mapping to Current Inbox Actions

| Fail-Safe Need | Current `NextActionKind` | Gap |
|---|---|---|
| Missing document | `missing_docs` | Does not distinguish "never requested" vs "waiting on signature" |
| Uploaded, awaiting review | `pending_approval` | Does not capture offline "at attorney's desk" state |
| AI / quality mismatch | `stp_exception` | May trigger late (after upload), not at "ready to send" |
| No progress 5+ days | `stuck` | Too slow for signature SLA (48h proposed) |
| All docs validated, no payment | `pending_resolution` | **Implemented** |
| Amount mismatch | `finance_gap` | **Implemented** |
| **Ready for signature** | — | **Not implemented — proposed `ready_for_signature`** |

---

## 6. Recommended Fail-Safe Implementation Order (Future)

When moving from analysis to code, implement in this order:

1. **`ready_for_signature` sub-status + Inbox segment** (Steps 4, 13) — highest Red Team priority.
2. **Demand stage lock** — block `demand_letter` upload/filing until Setup signature docs validated + demand marked signed (**Step 13 → 14**).
3. **Draft version hash** on POA and demand letter — wrong-version blocker.
4. **Signature SLA alerts** (48h) — faster than `stuck` (5d).
5. **Cross-field validation** — plate/client name on ID docs vs claim record.
6. **Filing confirmation** — optional receipt doc or confirmation number for Step 14.

---

## 7. Cross-References

| Document / Module | Role |
|---|---|
| [BUSINESS_PROCESS.md](./BUSINESS_PROCESS.md) | Canonical 6-stage business rules |
| `lib/documents.ts` | 15 `DocKind` definitions + stage mapping |
| `lib/document-workflow-gates.ts` | Stage-sequential upload validation (**Implemented**) |
| `lib/claim-progress.ts` | Validated-doc progress + `pending_resolution` (**Implemented**) |
| `lib/ops/next-action.ts` | Inbox priority ladder |
| `scripts/migrate-closed-payment-guard.sql` | DB CHECK: no `closed` without payment (**Implemented**) |

---

## 8. Red Team Sign-Off Checklist

Before declaring a claim "safe to close," verify:

- [ ] All 15 doc kinds **validated** (not merely uploaded).
- [ ] Steps 4 & 13 signature docs match **latest draft version** (when version gate exists).
- [ ] Demand letter validated **before** insurer filing recorded.
- [ ] `receivedAmount > 0` and matches insurer remittance.
- [ ] **`paymentConfirmedAt` set manually** — only path to `closed`.
- [ ] No open `stp_exception` or `pending_approval` on any doc.

---

*Last updated: Red Team failure analysis — registry logic only, no application code changes.*
