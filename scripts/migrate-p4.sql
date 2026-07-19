-- P4: Webhooks, SLO snapshots, support role ready (role stored on user.role text).

CREATE TABLE IF NOT EXISTS webhook_endpoint (
  id text PRIMARY KEY,
  url text NOT NULL,
  secret text NOT NULL,
  events text NOT NULL DEFAULT '[]',
  active boolean NOT NULL DEFAULT true,
  "createdBy" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_delivery (
  id text PRIMARY KEY,
  "endpointId" text NOT NULL,
  event text NOT NULL,
  payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  "lastError" text,
  "responseStatus" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "deliveredAt" timestamp
);

CREATE INDEX IF NOT EXISTS webhook_delivery_status_idx ON webhook_delivery (status);
CREATE INDEX IF NOT EXISTS webhook_delivery_endpoint_idx ON webhook_delivery ("endpointId");

CREATE TABLE IF NOT EXISTS slo_snapshot (
  id text PRIMARY KEY,
  metric text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL DEFAULT 'ms',
  meta text NOT NULL DEFAULT '{}',
  "recordedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slo_snapshot_metric_time_idx ON slo_snapshot (metric, "recordedAt" DESC);
