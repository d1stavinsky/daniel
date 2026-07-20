import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

/**
 * Normalize Neon/pg SSL query params so node-postgres stops warning that
 * sslmode=require is currently aliased to verify-full (pg-connection-string v3).
 * See: https://www.postgresql.org/docs/current/libpq-ssl.html
 */
function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw
  try {
    const url = new URL(raw)
    const mode = url.searchParams.get("sslmode")
    if (mode === "require" || mode === "prefer" || mode === "verify-ca") {
      // Keep require semantics under upcoming libpq-compatible parsing.
      url.searchParams.set("uselibpqcompat", "true")
      url.searchParams.set("sslmode", "require")
    }
    return url.toString()
  } catch {
    return raw
  }
}

const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL)

if (!connectionString && process.env.NODE_ENV !== "production") {
  console.warn("[db] DATABASE_URL is not set — database calls will fail until it is configured.")
}

export const pool = new Pool({
  connectionString,
  // Fail fast when Neon/DNS is unreachable (e.g. offline builds).
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 20_000,
  max: 10,
})

export const db = drizzle(pool, { schema })
