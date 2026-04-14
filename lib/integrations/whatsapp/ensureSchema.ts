import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const WHATSAPP_SCHEMA_FILES = [
  path.resolve(process.cwd(), 'supabase/migrations/20260310090000_whatsapp_connections.sql'),
  path.resolve(process.cwd(), 'supabase/migrations/20260311113000_whatsapp_messages.sql'),
];

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function missingWhatsAppTables(client: Client) {
  const result = await client.query<{ connections_exists: boolean; messages_exists: boolean }>(
    "select to_regclass('public.organization_whatsapp_connections') is not null as connections_exists, to_regclass('public.whatsapp_messages') is not null as messages_exists"
  );

  const row = result.rows[0];
  return !row?.connections_exists || !row?.messages_exists;
}

async function reloadPostgrestSchema(client: Client) {
  await client.query("select pg_notify('pgrst', 'reload schema')");
  await client.query("select pg_notify('pgrst', 'reload config')");
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

    const needsProvision = await missingWhatsAppTables(client);
    if (!needsProvision) {
      return { ok: true, skipped: false, created: false } as const;
    }

    await client.query(readSchemaSql());
    await reloadPostgrestSchema(client);
    await sleep(1500);

    return { ok: true, skipped: false, created: true } as const;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao aplicar schema automatico do WhatsApp.';
    return { ok: false, skipped: false, message } as const;
  } finally {
    await client.end().catch(() => undefined);
  }
}
