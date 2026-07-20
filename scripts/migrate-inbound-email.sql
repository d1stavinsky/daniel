CREATE TABLE IF NOT EXISTS inbound_email (
  id text PRIMARY KEY,
  "providerEventId" text NOT NULL,
  "providerEmailId" text NOT NULL,
  "providerMessageId" text,
  "claimId" text,
  "partnerId" text,
  "fromAddress" text NOT NULL,
  "toAddresses" text NOT NULL DEFAULT '[]',
  "ccAddresses" text NOT NULL DEFAULT '[]',
  subject text NOT NULL DEFAULT '',
  "textBody" text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'processing',
  error text,
  "receivedAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbound_email_provider_event_unique
  ON inbound_email ("providerEventId");

CREATE UNIQUE INDEX IF NOT EXISTS inbound_email_provider_email_unique
  ON inbound_email ("providerEmailId");

CREATE INDEX IF NOT EXISTS inbound_email_claim_received_idx
  ON inbound_email ("claimId", "receivedAt");

CREATE TABLE IF NOT EXISTS inbound_email_attachment (
  id text PRIMARY KEY,
  "inboundEmailId" text NOT NULL,
  "providerAttachmentId" text NOT NULL,
  "fileName" text NOT NULL,
  "fileSize" integer,
  "contentType" text NOT NULL DEFAULT 'application/octet-stream',
  "contentDisposition" text,
  "contentId" text,
  "blobPathname" text,
  status text NOT NULL DEFAULT 'processing',
  "rejectionReason" text,
  "savedDocumentId" text,
  "savedKind" text,
  "savedBy" text,
  "savedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbound_attachment_provider_unique
  ON inbound_email_attachment ("inboundEmailId", "providerAttachmentId");

CREATE INDEX IF NOT EXISTS inbound_attachment_email_idx
  ON inbound_email_attachment ("inboundEmailId");
