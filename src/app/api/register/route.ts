import { NextRequest, NextResponse } from 'next/server';

// Beri waktu lebih panjang dari default (10s di Vercel Hobby plan), karena request ini
// melakukan beberapa panggilan JSON-RPC berurutan ke Odoo (login, search/create owner,
// resolve breed, create pet) plus payload base64 foto vaksin yang cukup besar.
export const maxDuration = 30;

// ===== Konfigurasi dari environment variables (server-side, tidak terekspos ke browser) =====
const ODOO_URL = process.env.ODOO_URL; // contoh: https://furry.odoo.com
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_PASSWORD = process.env.ODOO_PASSWORD;

// ===== Helper: panggil JSON-RPC Odoo =====
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
    // json.error.data.message biasanya berisi pesan error Odoo yang lebih jelas
    const message = json.error?.data?.message || json.error?.message || 'Unknown Odoo error';
    throw new Error(message);
  }
  return json.result;
}

// ===== Helper: login, dapatkan uid Odoo =====
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
  return json.result as number; // uid
}

// ===== Helper: execute_kw (create/write/search/read) =====
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

// ===== Tipe payload yang diterima dari form (FurrytailFinalForm) =====
interface PetPayload {
  name: string;
  type: 'Anjing' | 'Kucing';
  dob: string;
  breedId: string; // ID record x_ras_pet existing yang dipilih. Kosong jika pakai breedNew.
  breedNew: string; // Nama breed baru yang diketik manual customer (kalau tidak ada di list).
  gender: 'Jantan' | 'Betina';
  weight: string;
  vaccineStatus: 'lengkap' | 'tidak_lengkap' | 'tidak_diketahui';
  vaccinePhotoBase64: string | null; // base64 (tanpa prefix data:...) -> x_studio_bukti_vaksin
  medicalHistory: string;
  hasGroomedBefore: 'Ya' | 'Tidak';
  behavior: 'Ramah' | 'Takut' | 'Agresif';
  allergyStatus: 'Tidak Ada' | 'Shampoo' | 'Parfum' | 'Lainnya';
  allergyDetail: string;
}

interface RegisterPayload {
  // Kalau ownerId terisi (customer lama, dipilih dari search), langkah create/dedup
  // owner di-skip sepenuhnya -> langsung pakai ownerId ini untuk relasi pet.
  ownerId?: number;
  fullName: string;
  phone: string;
  email: string;
  instagram: string;
  address: string;
  mapLink: string;
  pets: PetPayload[];
}

// Konversi nilai vaccineStatus form -> label selection Odoo
const VACCINE_STATUS_MAP: Record<PetPayload['vaccineStatus'], string> = {
  lengkap: 'Lengkap',
  tidak_lengkap: 'Tidak Lengkap',
  tidak_diketahui: 'Tidak Diketahui',
};

export async function POST(req: NextRequest) {
  try {
    if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) {
      return NextResponse.json(
        { error: 'Konfigurasi server Odoo belum lengkap (cek environment variables).' },
        { status: 500 }
      );
    }

    const payload: RegisterPayload = await req.json();

    const isExistingOwnerFlow = !!payload.ownerId;

    if (isExistingOwnerFlow) {
      // Customer lama: data diri tidak diisi ulang, cukup ownerId + minimal 1 pet.
      if (payload.pets.length === 0) {
        return NextResponse.json({ error: 'Tambahkan minimal satu hewan.' }, { status: 400 });
      }
    } else {
      // Customer baru: tetap wajib nama, telepon, dan minimal 1 pet.
      if (!payload.fullName || !payload.phone || payload.pets.length === 0) {
        return NextResponse.json({ error: 'Data wajib belum lengkap.' }, { status: 400 });
      }
    }

    const uid = await odooLogin();

    // 1. Tentukan ownerId.
    // - Customer lama (dipilih dari search autocomplete): langsung pakai ownerId yang dikirim,
    //   skip seluruh pengecekan/duplikasi di bawah ini.
    // - Customer baru: cek dulu apakah owner dengan nomor telepon ini sudah ada (mencegah
    //   duplikasi kalau request sebelumnya sempat membuat owner tapi gagal di langkah create
    //   pet, lalu customer submit ulang).
    let ownerId: number;
    let isNewOwner: boolean;

    if (isExistingOwnerFlow) {
      ownerId = payload.ownerId as number;
      isNewOwner = false;
    } else {
      const existingOwnerIds: number[] = await odooExecuteKw(uid, 'x_nama', 'search', [
        [['x_studio_nomor_telepon', '=', payload.phone]],
      ]);

      if (existingOwnerIds.length > 0) {
        // Owner dengan nomor telepon ini sudah ada -> pakai yang sudah ada, jangan buat baru.
        ownerId = existingOwnerIds[0];
        isNewOwner = false;
      } else {
        // Buat record Owner baru di model x_nama
        // Nama field di x_nama menyesuaikan struktur Studio kita: x_studio_nama_lengkap
        // dipakai automation untuk mengisi x_name (lihat catatan project: display_name workaround).
        ownerId = await odooExecuteKw(uid, 'x_nama', 'create', [
          {
            x_studio_nama_lengkap: payload.fullName,
            x_studio_nomor_telepon: payload.phone,
            x_studio_e_mail: payload.email || false,
            x_studio_instagram: payload.instagram || false,
            x_studio_alamat: payload.address || false,
            x_studio_google_maps: payload.mapLink || false,
          },
        ]);
        isNewOwner = true;
      }
    }

    // Helper: cari ID breed dari x_ras_pet. Kalau pet.breedId terisi, langsung pakai itu
    // (breed existing yang dipilih dari dropdown). Kalau kosong tapi pet.breedNew terisi,
    // cari dulu apakah breed dengan nama+jenis itu sudah ada (hindari duplikat kalau dua
    // customer ketik nama breed yang sama persis) -> kalau belum ada, baru create record baru.
    const resolveBreedId = async (pet: PetPayload): Promise<number | false> => {
      if (pet.breedId) {
        return parseInt(pet.breedId, 10);
      }

      const breedName = pet.breedNew?.trim();
      if (!breedName) return false;

      const existingBreedIds: number[] = await odooExecuteKw(uid, 'x_ras_pet', 'search', [
        [
          ['x_name', '=', breedName],
          ['x_studio_jenis_pet', '=', pet.type],
        ],
      ]);

      if (existingBreedIds.length > 0) {
        return existingBreedIds[0];
      }

      const newBreedId = await odooExecuteKw(uid, 'x_ras_pet', 'create', [
        {
          x_name: breedName,
          x_studio_jenis_pet: pet.type,
        },
      ]);
      return newBreedId as number;
    };

    // 2. Buat record per-pet di model x_pets, terhubung ke owner via x_studio_pet_owner_2.
    // Kalau salah satu create pet gagal di tengah jalan DAN owner ini baru saja dibuat
    // (bukan owner lama yang sudah ada sebelumnya), rollback: hapus owner supaya tidak
    // tertinggal record "yatim" tanpa pet.
    const createdPetIds: number[] = [];
    try {
      for (const pet of payload.pets) {
        const breedId = await resolveBreedId(pet);
        const petId = await odooExecuteKw(uid, 'x_pets', 'create', [
          {
            x_name: pet.name,
            x_studio_jenis_pet: pet.type,
            x_studio_tanggal_lahir_1: pet.dob,
            x_studio_ras_pet_1: breedId,
            x_studio_gender: pet.gender,
            x_studio_berat: parseFloat(pet.weight) || 0,
            x_studio_status_vaksin: VACCINE_STATUS_MAP[pet.vaccineStatus],
            x_studio_bukti_vaksin: pet.vaccinePhotoBase64 || false,
            x_studio_catatan: pet.medicalHistory || false,
            // True = belum pernah grooming sama sekali (first timer)
            x_studio_first_grooming_experience_1: pet.hasGroomedBefore === 'Tidak',
            x_studio_reaksi_ke_manusia: pet.behavior,
            x_studio_alergi_status: pet.allergyStatus,
            x_studio_catatan_alergi: pet.allergyDetail || false,
            x_studio_pet_owner_2: ownerId,
          },
        ]);
        createdPetIds.push(petId as number);
      }
    } catch (petErr) {
      // Rollback: hapus pet yang sempat berhasil dibuat di iterasi ini
      if (createdPetIds.length > 0) {
        await odooExecuteKw(uid, 'x_pets', 'unlink', [createdPetIds]).catch(() => {
          // best-effort, jangan sampai error rollback menutupi error asli
        });
      }
      // Rollback owner HANYA kalau owner ini baru dibuat di request ini (bukan owner lama)
      if (isNewOwner) {
        await odooExecuteKw(uid, 'x_nama', 'unlink', [[ownerId]]).catch(() => {
          // best-effort
        });
      }
      throw petErr;
    }

    return NextResponse.json({ success: true, ownerId, petIds: createdPetIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan tak terduga.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}