import { NextRequest, NextResponse } from 'next/server';

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

interface BreedResult {
  id: number;
  name: string;
}

// GET /api/breeds?type=Anjing  atau  ?type=Kucing
export async function GET(req: NextRequest) {
  try {
    if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
      return NextResponse.json(
        { error: 'Konfigurasi server Odoo belum lengkap (cek environment variables).' },
        { status: 500 }
      );
    }

    const type = req.nextUrl.searchParams.get('type');
    if (type !== 'Anjing' && type !== 'Kucing') {
      return NextResponse.json(
        { error: "Parameter 'type' harus 'Anjing' atau 'Kucing'." },
        { status: 400 }
      );
    }

    const uid = await odooLogin();

    const breedIds: number[] = await odooExecuteKw(uid, 'x_ras_pet', 'search', [
      [['x_studio_jenis_pet', '=', type]],
    ], { order: 'x_name asc' });

    if (breedIds.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const breeds = await odooExecuteKw(uid, 'x_ras_pet', 'read', [breedIds, ['x_name']]);

    const results: BreedResult[] = (
      breeds as Array<{ id: number; x_name: string | false }>
    ).map((b) => ({
      id: b.id,
      name: b.x_name || '(Tanpa nama)',
    }));

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tak terduga.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}