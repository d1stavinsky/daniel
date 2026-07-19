import {
  IDP_FIELD_DEFS,
  IDP_KIND_LABELS,
  type ExtractedDataPayload,
  type ExtractedField,
  type IdpPilotKind,
} from "@/lib/idp/types"

const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const DEFAULT_MODEL = process.env.OPENAI_IDP_MODEL || "gpt-4o-mini"

type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } }

function buildPrompt(kind: IdpPilotKind): string {
  const fields = IDP_FIELD_DEFS[kind]
  const fieldLines = fields.map((f) => `- ${f.key}: ${f.description} (label: ${f.label})`).join("\n")
  return `You are an insurance document intelligence system for Israeli (Hebrew/English) claim documents.
Document type: ${kind} (${IDP_KIND_LABELS[kind]}).

Extract these fields. Return ONLY valid JSON with this shape:
{
  "fields": [{ "key": string, "value": string|number|null, "confidence": number }],
  "overallConfidence": number,
  "notes": string
}

Rules:
- confidence is 0..1
- Use null when unknown; do not invent values
- Numbers must be plain numbers (no currency symbols)
- Dates preferably YYYY-MM-DD
- Prefer Hebrew labels in notes if relevant
- overallConfidence is the mean of field confidences (nulls count as 0.2)

Fields:
${fieldLines}`
}

function normalizePayload(kind: IdpPilotKind, raw: unknown): ExtractedDataPayload {
  const defs = IDP_FIELD_DEFS[kind]
  const obj = (raw && typeof raw === "object" ? raw : {}) as {
    fields?: { key?: string; value?: unknown; confidence?: number }[]
    overallConfidence?: number
    notes?: string
  }
  const byKey = new Map((obj.fields ?? []).map((f) => [f.key, f]))
  const fields: ExtractedField[] = defs.map((d) => {
    const hit = byKey.get(d.key)
    let value: string | number | null = null
    if (hit?.value !== undefined && hit.value !== null && hit.value !== "") {
      if (typeof hit.value === "number") value = hit.value
      else if (typeof hit.value === "string") {
        const asNum = Number(hit.value.replace(/[^\d.-]/g, ""))
        value =
          ["totalAmount", "vatAmount", "estimatedDamage", "demandedAmount"].includes(d.key) &&
          Number.isFinite(asNum)
            ? asNum
            : hit.value
      }
    }
    const confidence =
      typeof hit?.confidence === "number" && Number.isFinite(hit.confidence)
        ? Math.max(0, Math.min(1, hit.confidence))
        : value == null
          ? 0.2
          : 0.5
    return { key: d.key, label: d.label, value, confidence }
  })

  const mean =
    fields.length === 0 ? 0 : fields.reduce((s, f) => s + f.confidence, 0) / fields.length
  const overall =
    typeof obj.overallConfidence === "number" && Number.isFinite(obj.overallConfidence)
      ? Math.max(0, Math.min(1, obj.overallConfidence))
      : mean

  return {
    kind,
    fields,
    overallConfidence: overall,
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
    extractedAt: new Date().toISOString(),
  }
}

function parseJsonFromModel(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence?.[1]?.trim() ?? trimmed
  return JSON.parse(candidate)
}

/**
 * Call OpenAI vision/file chat for structured extraction.
 * Requires OPENAI_API_KEY. Throws on hard failures.
 */
export async function extractWithOpenAI(input: {
  kind: IdpPilotKind
  bytes: Buffer
  contentType: string
  fileName: string
}): Promise<{ payload: ExtractedDataPayload; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured")

  const model = DEFAULT_MODEL
  const b64 = input.bytes.toString("base64")
  const dataUrl = `data:${input.contentType || "application/octet-stream"};base64,${b64}`
  const isImage = (input.contentType || "").startsWith("image/")
  const isPdf =
    input.contentType === "application/pdf" || input.fileName.toLowerCase().endsWith(".pdf")

  const parts: OpenAiContentPart[] = [{ type: "text", text: buildPrompt(input.kind) }]
  if (isImage) {
    parts.push({ type: "image_url", image_url: { url: dataUrl } })
  } else if (isPdf) {
    parts.push({
      type: "file",
      file: { filename: input.fileName || "document.pdf", file_data: dataUrl },
    })
  } else {
    parts.push({
      type: "text",
      text: `Unsupported content type ${input.contentType}. Attempting best-effort from filename ${input.fileName}.`,
    })
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Extract structured claim document fields. Respond with JSON only.",
        },
        { role: "user", content: parts },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 400)}`)
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error("Empty model response")

  const parsed = parseJsonFromModel(content)
  return { payload: normalizePayload(input.kind, parsed), model }
}

/**
 * Offline / no-key fallback so the Review UI still appears (always needs_review).
 */
export function extractStub(kind: IdpPilotKind): { payload: ExtractedDataPayload; model: string } {
  const fields: ExtractedField[] = IDP_FIELD_DEFS[kind].map((d) => ({
    key: d.key,
    label: d.label,
    value: null,
    confidence: 0.15,
  }))
  return {
    model: "stub-no-api-key",
    payload: {
      kind,
      fields,
      overallConfidence: 0.15,
      notes: "OPENAI_API_KEY לא הוגדר — חילוץ דמה לבדיקת ממשק. הגדר מפתח להפעלת IDP אמיתי.",
      extractedAt: new Date().toISOString(),
    },
  }
}
