import { NextRequest, NextResponse } from 'next/server';

// ===== Konfigurasi dari environment variables (server-side, tidak terekspos ke browser) =====
const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

async function odooJsonRpc(method: string, params: Record<string, unknown>) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method,
        ...params,
      },
      id: Math.floor(Math.random() * 1000000),
    }),
  });

  if (!res.ok) {
    throw new Error(`Odoo HTTP error: ${res.status}`);
  }

  const json = await res.json();
  if (json.error) {
    const message = json.error?.data?.message || json.error?.message || 'Unknown Odoo error';
    throw new Error(message);
  }
  return json.result;
}

async function odooLogin(): Promise<number> {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'common',
        method: 'login',
        args: [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD],
      },
      id: 1,
    }),
  });

  const json = await res.json();
  if (json.error || !json.result) {
    throw new Error('Gagal login ke Odoo. Cek ODOO_DB / ODOO_USERNAME / ODOO_PASSWORD.');
  }
  return json.result as number;
}

async function odooExecuteKw(
  uid: number,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
) {
  return odooJsonRpc('execute_kw', {
    args: [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kwargs],
  });
}

interface OwnerSearchResult {
  id: number;
  name: string;
  phone: string;
}

// GET /api/owners/search?q=budi
export async function GET(req: NextRequest) {
  try {
    if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
      return NextResponse.json(
        { error: 'Konfigurasi server Odoo belum lengkap (cek environment variables).' },
        { status: 500 }
      );
    }

    const query = req.nextUrl.searchParams.get('q')?.trim() || '';

    // Jangan search kalau query terlalu pendek -> hindari query berat / hasil kebanyakan
    if (query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const uid = await odooLogin();

    // Cari berdasarkan nama lengkap ATAU nomor telepon, supaya autocomplete
    // tetap bisa nemu kalau customer ketik nomor telepon juga.
    const ownerIds: number[] = await odooExecuteKw(uid, 'x_nama', 'search', [
      [
        '|',
        ['x_studio_nama_lengkap', 'ilike', query],
        ['x_studio_nomor_telepon', 'ilike', query],
      ],
    ], { limit: 10 });

    if (ownerIds.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const owners = await odooExecuteKw(uid, 'x_nama', 'read', [
      ownerIds,
      ['x_studio_nama_lengkap', 'x_studio_nomor_telepon'],
    ]);

    const results: OwnerSearchResult[] = (
      owners as Array<{
        id: number;
        x_studio_nama_lengkap: string | false;
        x_studio_nomor_telepon: string | false;
      }>
    ).map((o) => ({
      id: o.id,
      name: o.x_studio_nama_lengkap || '(Tanpa nama)',
      phone: o.x_studio_nomor_telepon || '-',
    }));

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tak terduga.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}