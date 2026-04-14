import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const WHATSAPP_SCHEMA_FILES = [
  path.resolve(process.cwd(), 'supabase/migrations/20260310090000_whatsapp_connections.sql'),
  path.resolve(process.cwd(), 'supabase/migrations/20260311113000_whatsapp_messages.sql'),
];

function getDatabaseUrl() {
  return (
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ''
  ).trim();
}

function needsSsl(connectionString: string) {
  return !/sslmode=disable/i.test(connectionString);
}

function stripSslModeParam(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return connectionString;
  }
}

function readSchemaSql() {
  return WHATSAPP_SCHEMA_FILES.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n\n');
}

export async function ensureWhatsAppSchema() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    return {
      ok: false,
      skipped: true,
      message: 'SUPABASE_DB_URL nao configurada para auto-criar tabelas do WhatsApp.',
    } as const;
  }

  const client = new Client({
    connectionString: stripSslModeParam(dbUrl),
    ssl: needsSsl(dbUrl) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    await client.query(readSchemaSql());
    return { ok: true, skipped: false } as const;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao aplicar schema automatico do WhatsApp.';
    return { ok: false, skipped: false, message } as const;
  } finally {
    await client.end().catch(() => undefined);
  }
}
