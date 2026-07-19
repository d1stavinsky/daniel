# AXIS Claims Management — Operations Manual

**Audience:** Ops / attorney staff
**Purpose:** Run a claim safely from garage intake to closure
**Rule of thumb:** The system blocks shortcuts on purpose. If a button fails, fix the underlying document or amount — do not try to "force approve."

---

## How to use the Ops Inbox

Work from **Admin → Ops Inbox**. Each claim shows one **Next Action**. Handle the highest-priority items first:

| Priority | Inbox label (EN / HE) | Meaning |
|---:|---|---|
| 1 | Internal Audit / ביקורת פנימית | Demand amount vs appraisal out of tolerance |
| 2 | Review Mismatch / STP exception | AI or content mismatch on a document |
| 3 | Approve | Document uploaded, waiting for staff approval |
| 4 | Mark Signed & Upload / סומן כחתום והעלה | Demand draft waiting for wet attorney signature |
| 5 | Request Docs | Required document missing |
| 6 | Investigate Stuck | No progress for 5+ days |
| 7 | Confirm Payment | All 15 docs validated; awaiting payment confirm |
| 8 | Match Amounts | Received amount &lt; requested amount |

**SLA:** If Investigation or Demand sits idle **7+ days**, the row shows **SLA הופר**. Treat as urgent.

---

## Part 1 — Operations walkthrough (6 stages)

### Stage 1 — Intake (קליטה)

**Goal:** Open a clean claim from garage / partner contact.

1. Partner (or staff) creates the claim with plate, amounts, and partner.
2. Confirm basic data is correct (plate length, positive requested amount).
3. Claim enters the workflow; Inbox may show early Setup gaps as **Request Docs**.

**Staff tip:** Bad intake data causes pain later in STP and finance. Fix names, plates, and amounts now.

---

### Stage 2 — Setup (הקמה)

**Goal:** Legal package + identity docs validated.

**Upload / approve these (10 docs):**

- Power of Attorney, insurance policy, insurance-to-trust consent, trust account form
- Client: owner ID, driver license, vehicle license
- Third party: driver license, vehicle license
- Non-submission confirmation

**Staff steps:**

1. Collect / generate forms; get wet signatures offline where required.
2. Upload scans into the claim.
3. Review STP / IDP results; approve clean docs or resolve exceptions.
4. Do **not** try to upload Investigation docs yet — the system blocks Stage 3 until **all Stage 2 docs are validated**.

**Exit condition:** All Setup docs are `approved` or `auto_verified`.

---

### Stage 3 — Investigation (חקירה)

**Goal:** Prove damage and costs.

**Required docs (4):**

1. Appraiser / Shamai report (`appraiser_report`)
2. Repair invoice (`repair_invoice`)
3. Accident photos (`accident_photos`)
4. Attorney fee invoice (`attorney_fee_invoice`)

**Staff steps:**

1. Upload each file after Stage 2 is clear.
2. Approve or clear STP exceptions.
3. Watch the Inbox for **Request Docs**, **Approve**, or **SLA הופר**.

**Exit condition:** All Investigation docs validated. Only then can Demand begin.

---

### Stage 4 — Demand (דרישה)

**Goal:** Produce a correct demand letter, get attorney wet signature, then treat it as validated.

**Correct sequence (do not skip):**

1. Open the claim → **Generate demand-letter draft** (only when Stages 2+3 are validated).
2. Claim moves to **ממתין לחתימה** / **Mark Signed & Upload**.
3. Print → attorney signs → scan.
4. In Inbox, click **סומן כחתום והעלה** and upload the **signed** PDF of **this** draft.
5. System verifies the scan matches the draft version (hash). On success, signature becomes **verified**.
6. Complete any remaining approval / STP review so the demand letter is fully validated.

**If upload fails with "content mismatch":**
You signed an old/wrong draft. Re-generate if needed, re-sign the **current** draft, upload again. You cannot manually approve a version-mismatch demand.

**Exit condition:** Demand letter validated **and** signature status = **verified**.

---

### Stage 5 — Tracking (מעקב)

**Goal:** Follow insurer process; chase supplemental docs.

**Staff steps:**

1. Record filing / follow-up in the claim (operational notes / ledger).
2. If insurer asks for more materials, mark missing docs → partner tasks appear.
3. Clear **stuck** items (idle 5+ days) by chasing the garage, partner, or insurer.

There is no new mandatory doc kind for Tracking; progress is follow-up discipline.

---

### Stage 6 — Resolution (סגירה)

**Goal:** Money in, amounts match, claim closed correctly.

**Gates (all required):**

1. All **15** mandatory documents validated.
2. Enter **received amount** from remittance.
3. If received &lt; requested → Inbox shows **Match Amounts** — reconcile before closing.
4. Staff explicitly **Confirm Payment** (`paymentConfirmedAt`).
5. Claim can move to **completed / closed**.

**Critical:** Claims do **not** auto-close when docs are done. Someone must confirm payment.

Optional ops control: funds-released toggle is separate from the close gate — follow your finance policy.

---

## Part 2 — Safety Gates (why the system blocks you)

Think of these as seatbelts. They stop a claim from looking "done" when it is not legally or financially safe.

### 1. Stage sequence gate
**Blocks:** Uploading Investigation before Setup is validated; uploading Demand before Setup + Investigation are validated.
**Why:** You must not send a demand (or assess damage) without a complete legal + ID package.

### 2. Demand draft eligibility
**Blocks:** Generating a demand letter too early.
**Why:** The letter must be built from a complete, validated file.

### 3. Attorney signature gate (Demand)
**Blocks:** Approving / validating a demand letter while signature is missing or only `pending_signature`.
**Why:** An unsigned demand must never count as a real filing document.

### 4. Version-hash gate
**Blocks:** Approving a signed scan that does not match the current draft (Content Mismatch).
**Why:** Stops "wrong version signed" — e.g. old amounts after a regen.

### 5. Demand stage lock
**Blocks:** Advancing other Demand-related uploads/actions while signature is outstanding.
**Why:** Keeps the claim parked until the wet-signed letter is verified.

### 6. Internal Audit gate (Demand vs Appraisal)
**Blocks:** Approving the demand from the exception queue, and later payment confirmation, while Internal Audit is open.
**Trigger:** Demanded amount &gt; appraisal estimate by more than **20%**.
**Why:** Prevents sending (or settling) an inflated demand without human review of the numbers.

### 7. Fourteen-doc gate
**Blocks:** Moving to "pending resolution / confirm payment" until all 15 kinds are validated.
**Why:** Closure without a complete file is a compliance risk.

### 8. Payment confirmation gate
**Blocks:** Closing without manual payment confirmation and a positive received amount.
**Why:** Document completeness ≠ money received.

### 9. SLA / stuck alerts
**Does not hard-block**, but raises urgency:
- **7 days** idle in Investigation or Demand → SLA breached
- **5 days** no progress → Stuck

**Why:** Offline work (signatures, appraisers, insurers) must not disappear silently.

---

## Part 3 — Stuck in Internal Audit: what to do

**What it means:**
The system compared the **demand letter amount** to the **appraiser (Shamai) estimate**. The demand is more than **20%** above appraisal. The claim is parked under **ביקורת פנימית**.

### What will *not* work
- Clicking **Approve** on the exception / Internal Audit item
- Dismissing it and hoping payment confirm works later
- Approving the demand letter manually while the audit flag is open

The system intentionally refuses those shortcuts.

### Resolution checklist

1. **Open the claim** and read the Internal Audit reason (both amounts and % excess).
2. **Decide which number is wrong:**
   - Demand too high → regenerate the demand draft with the correct amount, then re-run the signed-upload flow (**סומן כחתום והעלה**).
   - Appraisal wrong / incomplete → correct or re-upload the appraiser report and ensure extraction has the right `estimatedDamage`.
   - Both intentional (special case) → escalate to attorney/manager; you still must bring amounts within policy/tolerance or get an explicit offline decision and then update the documents so the system can clear the flag.
3. **Wait for re-audit:** When demand and appraisal are within **20%**, the Internal Audit flag clears automatically on the next cross-field run.
4. **Confirm Inbox:** Next action should leave **Internal Audit** (often moves to signature, approve, or tracking).
5. Only then continue filing / tracking / payment.

### If it still will not clear

| Check | Action |
|---|---|
| Extraction missing amounts | Re-run extraction / HITL review so `demandedAmount` and `estimatedDamage` exist |
| Old signed PDF still attached | Reset/remove demand file, regenerate draft, re-sign, re-upload via signature modal |
| Content Mismatch also open | Upload the scan that matches the **current** draft hash |
| Still blocked at payment | Open Internal Audit must be gone before Confirm Payment |

---

## Quick training card (print / pin)

| Stage | Your job | System will stop you if… |
|---|---|---|
| 1 Intake | Open accurate claim | Bad plate / amount / partner data |
| 2 Setup | Upload + validate legal & IDs | You try Investigation early |
| 3 Investigation | Upload + validate 4 evidence docs | You try Demand early |
| 4 Demand | Draft → wet sign → **סומן כחתום והעלה** | No signature, wrong version, Internal Audit |
| 5 Tracking | Chase insurer / missing docs | Item goes Stuck / SLA |
| 6 Resolution | Enter remittance → Confirm Payment | Docs incomplete, finance gap, open Internal Audit |

---

## Staff golden rules

1. **Inbox order = priority.** Always clear Internal Audit and STP mismatches before chasing routine missing docs.
2. **Never approve around a red gate.** Fix the document or the amount.
3. **Demand = draft + wet signature + verified upload.** Generating a PDF is not enough.
4. **Close only after real money is confirmed.** Validated docs alone never close a claim.
5. **SLA / Stuck means call someone today** (attorney, garage, partner, or insurer) — the clock is already late.

---

## Appendix — WhatsApp Intake (alternative Stage 1 entry)

Partners can open a claim from WhatsApp instead of waiting for admin web entry.

**Message format (exact):**
```text
קליטה [מספר טלפון] [מספר רכב] [שם לקוח]
```
Example: `קליטה 12-345-67 0501234567`

**What happens:**
1. AXIS opens the claim (same scaffolding as the admin form: stage ledger + 15 pending docs).
2. Partner receives WhatsApp confirmation with the plate.
3. Client receives a WhatsApp message with a signed intake link (`/client-intake`).

**Fail-safe reply (bad format):**
`פורמט לא תקין, אנא שלח: קליטה [טלפון] [רכב] [שם לקוח]`

**Ops notes:**
- Claim opens with placeholder client name (`לקוח 05X-…`), `requestedAmount = 0`, and `intakeSource = whatsapp`. Staff should update name/amount in Admin.
- Sender WhatsApp number must match `partner.whatsappPhone`, or `WHATSAPP_INTAKE_DEFAULT_PARTNER_ID` must be set.
- Endpoint: `POST /api/webhook/whatsapp-intake` (Bearer `WHATSAPP_WEBHOOK_SECRET` or Twilio signature).
