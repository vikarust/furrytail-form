'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Fredoka, Nunito } from 'next/font/google';

// Font konsisten dengan identitas Furrytail (sama seperti dipakai di Grooming Report PDF):
// Fredoka untuk judul/heading (rounded, playful, senada dengan logo "furrytail"),
// Nunito untuk body text/label (rounded juga, tapi lebih netral untuk teks panjang & form).
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fredoka',
});

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-nunito',
});

// Hasil pencarian owner existing dari /api/owners/search
interface OwnerSearchResult {
  id: number;
  name: string;
  phone: string;
}

// Tipe sudah disesuaikan agar value-nya match 1:1 dengan selection options di Odoo (x_pets)
interface PetInput {
  name: string; // -> x_name
  type: 'Anjing' | 'Kucing'; // -> x_studio_jenis_pet
  dob: string; // -> x_studio_tanggal_lahir_1
  breed: string; // Label tampilan breed (untuk UI saja, tidak dikirim langsung ke Odoo)
  breedId: string; // id record x_ras_pet existing yang dipilih dari dropdown. Kosong jika pakai breedNew.
  breedNew: string; // Nama breed baru yang diketik manual (kalau tidak ada di list) -> x_ras_pet dibuat otomatis di server
  isAddingNewBreed: boolean; // true saat customer memilih opsi "Lainnya / Ras baru" di dropdown
  gender: 'Jantan' | 'Betina'; // -> x_studio_gender
  weight: string; // -> x_studio_berat
  vaccineStatus: 'lengkap' | 'tidak_lengkap' | 'tidak_diketahui'; // -> x_studio_status_vaksin
  vaccinePhoto: File | null; // -> x_studio_bukti_vaksin
  medicalHistory: string; // -> x_studio_catatan
  hasGroomedBefore: 'Ya' | 'Tidak'; // Manual dari customer. Saat submit ke Odoo, konversi ke field boolean x_studio_first_grooming_experience_1: True = belum pernah grooming sama sekali (first timer) -> kebalikan dari "Ya" di sini. Mapping: hasGroomedBefore === 'Tidak' => true, hasGroomedBefore === 'Ya' => false.
  behavior: 'Ramah' | 'Takut' | 'Agresif'; // -> x_studio_reaksi_ke_manusia
  allergyStatus: 'Tidak Ada' | 'Shampoo' | 'Parfum' | 'Lainnya'; // -> field baru (selection)
  allergyDetail: string; // -> field baru (text)
}

// Hasil fetch live dari /api/breeds (model x_ras_pet di Odoo)
interface BreedOption {
  id: string;
  name: string;
}

// Penanda khusus untuk opsi "Lainnya / Ras baru" di dropdown breed
const BREED_NEW_OPTION = '__new__';

const emptyPet = (): PetInput => ({
  name: '',
  type: 'Anjing',
  dob: '',
  breed: '',
  breedId: '',
  breedNew: '',
  isAddingNewBreed: false,
  gender: 'Jantan',
  weight: '',
  vaccineStatus: 'tidak_diketahui',
  vaccinePhoto: null,
  medicalHistory: '',
  hasGroomedBefore: 'Tidak',
  behavior: 'Ramah',
  allergyStatus: 'Tidak Ada',
  allergyDetail: '',
});

// Konversi untuk payload JSON-RPC ke Odoo (dipakai nanti di Phase 3b).
// x_studio_first_grooming_experience_1: True = belum pernah grooming sama sekali (first timer).
const toFirstGroomingExperienceField = (hasGroomedBefore: PetInput['hasGroomedBefore']): boolean =>
  hasGroomedBefore === 'Tidak';

export default function FurrytailFinalForm() {
  const [lang, setLang] = useState<'id' | 'en'>('id');

  // Mode customer: baru (isi semua data diri) vs lama (pilih dari owner existing)
  const [customerMode, setCustomerMode] = useState<'baru' | 'lama'>('baru');
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const [ownerSearchResults, setOwnerSearchResults] = useState<OwnerSearchResult[]>([]);
  const [ownerSearchLoading, setOwnerSearchLoading] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<OwnerSearchResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [address, setAddress] = useState('');
  const [mapLink, setMapLink] = useState('');

  const [pets, setPets] = useState<PetInput[]>([emptyPet()]);

  // Cache hasil fetch /api/breeds per jenis hewan, supaya tidak fetch berulang
  // kalau ada beberapa pet dengan jenis yang sama (Anjing/Kucing).
  const [breedCache, setBreedCache] = useState<Record<'Anjing' | 'Kucing', BreedOption[]>>({
    Anjing: [],
    Kucing: [],
  });
  const [breedLoading, setBreedLoading] = useState<Record<'Anjing' | 'Kucing', boolean>>({
    Anjing: false,
    Kucing: false,
  });

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Fetch daftar breed untuk jenis hewan tertentu, sekali saja per jenis (di-cache).
  const fetchBreeds = async (type: 'Anjing' | 'Kucing') => {
    if (breedCache[type].length > 0 || breedLoading[type]) return;

    setBreedLoading((prev) => ({ ...prev, [type]: true }));
    try {
      const res = await fetch(`/api/breeds?type=${encodeURIComponent(type)}`);
      const data = await res.json();
      setBreedCache((prev) => ({ ...prev, [type]: data.results || [] }));
    } catch {
      setBreedCache((prev) => ({ ...prev, [type]: [] }));
    } finally {
      setBreedLoading((prev) => ({ ...prev, [type]: false }));
    }
  };

  // Fetch breed untuk jenis default (Anjing, sesuai default emptyPet) saat form pertama dimuat
  useEffect(() => {
    fetchBreeds('Anjing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search ke /api/owners/search saat mode "lama" dan query >= 2 karakter
  useEffect(() => {
    if (customerMode !== 'lama' || selectedOwner) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = ownerSearchQuery.trim();
    if (query.length < 2) {
      setOwnerSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setOwnerSearchLoading(true);
      try {
        const res = await fetch(`/api/owners/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setOwnerSearchResults(data.results || []);
      } catch {
        setOwnerSearchResults([]);
      } finally {
        setOwnerSearchLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ownerSearchQuery, customerMode, selectedOwner]);

  const handleSelectOwner = (owner: OwnerSearchResult) => {
    setSelectedOwner(owner);
    setOwnerSearchQuery(owner.name);
    setOwnerSearchResults([]);
  };

  const handleResetOwnerSelection = () => {
    setSelectedOwner(null);
    setOwnerSearchQuery('');
    setOwnerSearchResults([]);
  };

  const handleSwitchCustomerMode = (mode: 'baru' | 'lama') => {
    setCustomerMode(mode);
    handleResetOwnerSelection();
  };

  const dict = {
    id: {
      title: 'Pendaftaran Pelanggan & Hewan Baru',
      subtitle: 'Furrytail Pet Grooming Salon & Dog Hotel',
      customerModeLabel: 'Apakah Anda customer baru atau sudah pernah daftar?',
      customerModeBaru: 'Customer Baru',
      customerModeLama: 'Customer Lama',
      ownerSearchPlaceholder: 'Ketik nama atau nomor telepon...',
      ownerSearchLoading: 'Mencari...',
      ownerSearchEmpty: 'Tidak ditemukan. Coba kata kunci lain.',
      ownerSearchHint: 'Minimal 2 karakter untuk mulai mencari',
      ownerSelectedLabel: 'Pemilik terpilih',
      ownerChangeBtn: 'Ganti',
      ownerSection: '👤 1. Data Pemilik (Owner)',
      ownerName: 'Nama Lengkap Pemilik *',
      ownerPhone: 'No. WhatsApp / Telepon *',
      ownerEmail: 'Email',
      ownerInstagram: 'Instagram (username)',
      addressLabel: 'Alamat Rumah',
      mapsLabel: 'Link Google Maps Alamat Rumah',
      petSection: '🐾 2. Informasi Hewan Peliharaan (Pets)',
      addPetBtn: '+ Tambah Hewan',
      deletePetBtn: 'Hapus',
      petName: 'Nama Hewan *',
      petType: 'Jenis *',
      typeAnjing: 'Anjing',
      typeKucing: 'Kucing',
      petGender: 'Gender *',
      genderJantan: 'Jantan',
      genderBetina: 'Betina',
      petBreed: 'Ras Hewan *',
      breedLoadingLabel: 'memuat...',
      breedNewOption: '+ Ras tidak ada di daftar / tambah baru',
      breedNewPlaceholder: 'Ketik nama ras baru *',
      petDob: 'Tanggal Lahir *',
      petWeight: 'Berat (kg) *',
      quest1: 'Apakah sudah pernah grooming sebelumnya?',
      quest2: '2. Reaksi ke orang baru?',
      quest3: 'Status Vaksin *',
      questPhoto: 'Foto Bukti Vaksin (maks. 3MB)',
      quest5: 'Riwayat Penyakit / Catatan Khusus',
      quest4: '3. Status Alergi',
      allergyDetailLabel: 'Detail Alergi (jika ada)',
      submitBtn: 'Daftarkan Pelanggan & Hewan',
      yes: 'Ya',
      no: 'Tidak',
      vaccineOptions: {
        lengkap: 'Lengkap',
        tidak_lengkap: 'Tidak Lengkap',
        tidak_diketahui: 'Tidak Diketahui',
      },
      behaviorOptions: {
        Ramah: 'Ramah',
        Takut: 'Takut',
        Agresif: 'Agresif',
      },
      allergyOptions: {
        'Tidak Ada': 'Tidak Ada',
        Shampoo: 'Shampoo',
        Parfum: 'Parfum',
        Lainnya: 'Lainnya',
      },
    },
    en: {
      title: 'New Customer & Pet Registration',
      subtitle: 'Furrytail Pet Grooming Salon & Dog Hotel',
      customerModeLabel: 'Are you a new customer or have you registered before?',
      customerModeBaru: 'New Customer',
      customerModeLama: 'Returning Customer',
      ownerSearchPlaceholder: 'Type name or phone number...',
      ownerSearchLoading: 'Searching...',
      ownerSearchEmpty: 'No match found. Try another keyword.',
      ownerSearchHint: 'Minimum 2 characters to start searching',
      ownerSelectedLabel: 'Selected owner',
      ownerChangeBtn: 'Change',
      ownerSection: '👤 1. Owner Information',
      ownerName: 'Full Name *',
      ownerPhone: 'WhatsApp / Phone *',
      ownerEmail: 'Email',
      ownerInstagram: 'Instagram (username)',
      addressLabel: 'Home Address',
      mapsLabel: 'Google Maps Link',
      petSection: '🐾 2. Pets Information',
      addPetBtn: '+ Add Pet',
      deletePetBtn: 'Remove',
      petName: 'Pet Name *',
      petType: 'Type *',
      typeAnjing: 'Dog',
      typeKucing: 'Cat',
      petGender: 'Gender *',
      genderJantan: 'Male',
      genderBetina: 'Female',
      petBreed: 'Breed *',
      breedLoadingLabel: 'loading...',
      breedNewOption: '+ Breed not listed / add new',
      breedNewPlaceholder: 'Type new breed name *',
      petDob: 'Date of Birth *',
      petWeight: 'Weight (kg) *',
      quest1: 'Has this pet been groomed before?',
      quest2: '2. Reaction to strangers?',
      quest3: 'Vaccine Status *',
      questPhoto: 'Vaccine Proof Photo (max. 3MB)',
      quest5: 'Medical History / Special Notes',
      quest4: '3. Allergy Status',
      allergyDetailLabel: 'Allergy Detail (if any)',
      submitBtn: 'Register Customer & Pets',
      yes: 'Yes',
      no: 'No',
      vaccineOptions: {
        lengkap: 'Complete',
        tidak_lengkap: 'Incomplete',
        tidak_diketahui: 'Unknown',
      },
      behaviorOptions: {
        Ramah: 'Friendly',
        Takut: 'Fearful',
        Agresif: 'Aggressive',
      },
      allergyOptions: {
        'Tidak Ada': 'None',
        Shampoo: 'Shampoo',
        Parfum: 'Perfume',
        Lainnya: 'Other',
      },
    },
  };

  const t = dict[lang];

  const handleAddPet = () => {
    setPets([...pets, emptyPet()]);
  };

  const handleRemovePet = (index: number) => {
    if (pets.length === 1) return; // minimal 1 pet
    setPets(pets.filter((_, i) => i !== index));
  };

  const handlePetChange = <K extends keyof PetInput>(
    index: number,
    field: K,
    value: PetInput[K]
  ) => {
    setPets((prev) => {
      const newPets = [...prev];
      newPets[index] = { ...newPets[index], [field]: value };

      // Reset ras hewan kalau jenis pet diganti (Anjing <-> Kucing), karena daftar ras berbeda
      if (field === 'type') {
        newPets[index].breedId = '';
        newPets[index].breed = '';
        newPets[index].breedNew = '';
        newPets[index].isAddingNewBreed = false;
      }

      return newPets;
    });

    // Fetch breed untuk jenis baru kalau belum pernah di-fetch (di luar setPets,
    // supaya tidak memicu side-effect ganda akibat React StrictMode double-invoke)
    if (field === 'type') {
      fetchBreeds(value as 'Anjing' | 'Kucing');
    }
  };

  // Khusus breed: breedId dan breed (label) harus di-update bersamaan dalam satu setPets,
  // supaya tidak saling menimpa (dua panggilan handlePetChange terpisah pada event yang sama
  // sama-sama membaca closure state lama, sehingga panggilan kedua menghapus hasil yang pertama).
  const handleBreedChange = (index: number, breedId: string, breedLabel: string) => {
    setPets((prev) => {
      const newPets = [...prev];
      newPets[index] = {
        ...newPets[index],
        breedId,
        breed: breedLabel,
        breedNew: '',
        isAddingNewBreed: false,
      };
      return newPets;
    });
  };

  // Khusus breed baru (manual): kosongkan breedId, isi breedNew, set flag isAddingNewBreed
  const handleBreedNewChange = (index: number, value: string) => {
    setPets((prev) => {
      const newPets = [...prev];
      newPets[index] = {
        ...newPets[index],
        breedId: '',
        breed: '',
        breedNew: value,
        isAddingNewBreed: true,
      };
      return newPets;
    });
  };

  // Base64 encoding menambah ~33% ukuran file. Vercel Serverless Functions (plan gratis/hobby)
  // membatasi body request sekitar 4.5MB, jadi batas file asli di sini sengaja dijaga di bawah itu
  // (3MB asli -> ~4MB setelah base64, masih ada margin aman).
  const MAX_PHOTO_SIZE_BYTES = 3 * 1024 * 1024; // 3MB

  const handlePetFileChange = (index: number, file: File | null) => {
    if (file && file.size > MAX_PHOTO_SIZE_BYTES) {
      setStatusMessage(
        lang === 'id'
          ? '❌ Ukuran foto maksimal 3MB.'
          : '❌ Maximum photo size is 3MB.'
      );
      return;
    }
    const newPets = [...pets];
    newPets[index] = { ...newPets[index], vaccinePhoto: file };
    setPets(newPets);
  };

  // Konversi File -> base64 string (tanpa prefix "data:...;base64,"), siap dikirim
  // sebagai payload binary field x_studio_bukti_vaksin ke Odoo via JSON-RPC.
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // result berformat "data:image/png;base64,XXXXX" -> ambil bagian setelah koma saja
        const base64 = result.split(',')[1] ?? '';
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validasi khusus mode "lama": owner harus sudah dipilih dari search box
    if (customerMode === 'lama' && !selectedOwner) {
      setStatusMessage(
        lang === 'id'
          ? '❌ Silakan pilih nama pemilik terlebih dahulu.'
          : '❌ Please select an owner first.'
      );
      return;
    }

    setLoading(true);
    setStatusMessage('');

    try {
      // Konversi semua foto vaksin (kalau ada) ke base64 sebelum dikirim
      const petsWithPhoto = await Promise.all(
        pets.map(async (pet) => ({
          ...pet,
          vaccinePhotoBase64: pet.vaccinePhoto ? await fileToBase64(pet.vaccinePhoto) : null,
        }))
      );

      const payload = {
        // Mode "lama": kirim ownerId, route.ts akan skip create/dedup owner sepenuhnya.
        // Mode "baru": ownerId tidak diikutkan, data diri di bawah ini yang dipakai.
        ...(customerMode === 'lama' && selectedOwner ? { ownerId: selectedOwner.id } : {}),
        fullName,
        phone,
        email,
        instagram,
        address,
        mapLink,
        pets: petsWithPhoto.map((pet) => ({
          name: pet.name,
          type: pet.type,
          dob: pet.dob,
          breedId: pet.breedId,
          breedNew: pet.breedNew,
          gender: pet.gender,
          weight: pet.weight,
          vaccineStatus: pet.vaccineStatus,
          vaccinePhotoBase64: pet.vaccinePhotoBase64,
          medicalHistory: pet.medicalHistory,
          hasGroomedBefore: pet.hasGroomedBefore,
          behavior: pet.behavior,
          allergyStatus: pet.allergyStatus,
          allergyDetail: pet.allergyDetail,
        })),
      };

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Gagal menyimpan data.');
      }

      setStatusMessage(lang === 'id' ? '✅ Data Berhasil Disimpan!' : '✅ Data Saved Successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan tak terduga.';
      setStatusMessage(lang === 'id' ? `❌ Gagal: ${message}` : `❌ Failed: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`${fredoka.variable} ${nunito.variable} min-h-screen py-10 px-4 bg-[#FDF8F4]`}
      style={{
        fontFamily: 'var(--font-nunito), sans-serif',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='56' height='56' viewBox='0 0 56 56' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%235C3A21' fill-opacity='0.07' transform='rotate(-18 28 28)'%3E%3Cellipse cx='28' cy='36' rx='10' ry='8.5'/%3E%3Cellipse cx='15' cy='23' rx='4.6' ry='6' transform='rotate(-20 15 23)'/%3E%3Cellipse cx='24' cy='15' rx='4.6' ry='6' transform='rotate(-7 24 15)'/%3E%3Cellipse cx='34' cy='15' rx='4.6' ry='6' transform='rotate(7 34 15)'/%3E%3Cellipse cx='42' cy='23' rx='4.6' ry='6' transform='rotate(20 42 23)'/%3E%3C/g%3E%3C/svg%3E")`,
        backgroundSize: '90px 90px',
      }}
    >
      {/* Tombol Bahasa */}
      <div className="absolute top-4 right-4 z-50 bg-white p-1 rounded-full shadow-md flex gap-1">
        <button
          type="button"
          onClick={() => setLang('id')}
          className={`px-3 py-1 rounded-full text-xs font-bold ${lang === 'id' ? 'bg-[#5C3A21] text-white' : ''}`}
        >
          🇮🇩 ID
        </button>
        <button
          type="button"
          onClick={() => setLang('en')}
          className={`px-3 py-1 rounded-full text-xs font-bold ${lang === 'en' ? 'bg-[#5C3A21] text-white' : ''}`}
        >
          🇬🇧 EN
        </button>
      </div>

      <div className="max-w-4xl mx-auto bg-[#FEFEF2] p-8 rounded-3xl shadow-xl border border-amber-100">
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="relative w-64 h-32 mb-4">
            <Image src="/logo.png" alt="Logo" fill className="object-contain" priority />
          </div>
          <h1
            className="text-2xl font-bold text-[#5C3A21] uppercase tracking-wide"
            style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}
          >
            {t.title}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* === 0. Toggle Customer Baru / Lama === */}
          <div className="bg-[#FAF3EC] p-6 rounded-2xl">
            <label className="text-xs font-semibold text-[#5C3A21] block mb-2">
              {t.customerModeLabel}
            </label>
            <div className="flex gap-3 mb-4">
              <button
                type="button"
                onClick={() => handleSwitchCustomerMode('baru')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 ${
                  customerMode === 'baru'
                    ? 'bg-[#5C3A21] text-white border-[#5C3A21]'
                    : 'bg-white text-[#5C3A21] border-[#EEDCD0]'
                }`}
              >
                {t.customerModeBaru}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchCustomerMode('lama')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 ${
                  customerMode === 'lama'
                    ? 'bg-[#5C3A21] text-white border-[#5C3A21]'
                    : 'bg-white text-[#5C3A21] border-[#EEDCD0]'
                }`}
              >
                {t.customerModeLama}
              </button>
            </div>

            {/* Search box: hanya muncul di mode "lama" */}
            {customerMode === 'lama' && (
              <div>
                {selectedOwner ? (
                  <div className="flex items-center justify-between bg-white border border-[#EEDCD0] rounded-xl p-3">
                    <div>
                      <p className="text-xs text-[#8a6f5a]">{t.ownerSelectedLabel}</p>
                      <p className="text-sm font-semibold text-[#5C3A21]">
                        {selectedOwner.name}{' '}
                        <span className="font-normal text-[#8a6f5a]">
                          ({selectedOwner.phone})
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetOwnerSelection}
                      className="text-xs text-red-600 underline whitespace-nowrap ml-3"
                    >
                      {t.ownerChangeBtn}
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={t.ownerSearchPlaceholder}
                      value={ownerSearchQuery}
                      onChange={(e) => setOwnerSearchQuery(e.target.value)}
                      className="w-full p-3 rounded-xl border"
                    />
                    {ownerSearchQuery.trim().length > 0 &&
                      ownerSearchQuery.trim().length < 2 && (
                        <p className="text-xs text-[#8a6f5a] mt-1">{t.ownerSearchHint}</p>
                      )}
                    {ownerSearchLoading && (
                      <p className="text-xs text-[#8a6f5a] mt-1">{t.ownerSearchLoading}</p>
                    )}
                    {!ownerSearchLoading &&
                      ownerSearchQuery.trim().length >= 2 &&
                      ownerSearchResults.length === 0 && (
                        <p className="text-xs text-[#8a6f5a] mt-1">{t.ownerSearchEmpty}</p>
                      )}
                    {ownerSearchResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-[#EEDCD0] rounded-xl shadow-lg overflow-hidden">
                        {ownerSearchResults.map((owner) => (
                          <button
                            type="button"
                            key={owner.id}
                            onClick={() => handleSelectOwner(owner)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAF3EC] border-b border-[#EEDCD0] last:border-b-0"
                          >
                            <span className="font-semibold text-[#5C3A21]">{owner.name}</span>{' '}
                            <span className="text-[#8a6f5a]">({owner.phone})</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* === 1. Data Pemilik === */}
          {/* Hanya tampil untuk customer baru. Customer lama: data sudah ada di Odoo,
              cukup pilih lewat search box di atas. */}
          {customerMode === 'baru' && (
          <div className="bg-[#FAF3EC] p-6 rounded-2xl">
            <h2
              className="text-base font-semibold text-[#5C3A21] mb-4"
              style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}
            >
              {t.ownerSection}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder={t.ownerName}
                required
                value={fullName}
                className="w-full p-3 rounded-xl border"
                onChange={(e) => setFullName(e.target.value)}
              />
              <input
                type="tel"
                placeholder={t.ownerPhone}
                required
                value={phone}
                className="w-full p-3 rounded-xl border"
                onChange={(e) => setPhone(e.target.value)}
              />
              <input
                type="email"
                placeholder={t.ownerEmail}
                value={email}
                className="w-full p-3 rounded-xl border"
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="text"
                placeholder={t.ownerInstagram}
                value={instagram}
                className="w-full p-3 rounded-xl border"
                onChange={(e) => setInstagram(e.target.value)}
              />
              <textarea
                placeholder={t.addressLabel}
                value={address}
                className="w-full p-3 rounded-xl border md:col-span-2"
                onChange={(e) => setAddress(e.target.value)}
              />
              <input
                type="url"
                placeholder={t.mapsLabel}
                value={mapLink}
                className="w-full p-3 rounded-xl border md:col-span-2"
                onChange={(e) => setMapLink(e.target.value)}
              />
            </div>
          </div>
          )}

          {/* === 2. Informasi Hewan === */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2
                className="text-base font-semibold text-[#5C3A21]"
                style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}
              >
                {t.petSection}
              </h2>
              <button
                type="button"
                onClick={handleAddPet}
                className="text-xs bg-[#5C3A21] text-white px-3 py-2 rounded-xl"
              >
                {t.addPetBtn}
              </button>
            </div>

            {pets.map((pet, idx) => {
              const breedChoices = breedCache[pet.type];

              return (
                <div
                  key={idx}
                  className="bg-[#FEFEF2] border-2 border-[#EEDCD0] p-5 rounded-2xl mb-4 space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#5C3A21]">
                      Pet #{idx + 1}
                    </span>
                    {pets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePet(idx)}
                        className="text-xs text-red-600 underline"
                      >
                        {t.deletePetBtn}
                      </button>
                    )}
                  </div>

                  {/* Data dasar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <input
                      type="text"
                      placeholder={t.petName}
                      required
                      value={pet.name}
                      className="p-2 border rounded-lg"
                      onChange={(e) => handlePetChange(idx, 'name', e.target.value)}
                    />

                    <select
                      value={pet.type}
                      className="p-2 border rounded-lg"
                      onChange={(e) =>
                        handlePetChange(idx, 'type', e.target.value as PetInput['type'])
                      }
                    >
                      <option value="Anjing">{t.typeAnjing}</option>
                      <option value="Kucing">{t.typeKucing}</option>
                    </select>

                    <select
                      value={pet.gender}
                      className="p-2 border rounded-lg"
                      onChange={(e) =>
                        handlePetChange(idx, 'gender', e.target.value as PetInput['gender'])
                      }
                    >
                      <option value="Jantan">{t.genderJantan}</option>
                      <option value="Betina">{t.genderBetina}</option>
                    </select>

                    {/* Ras: dropdown live dari x_ras_pet, + opsi ketik ras baru kalau tidak ada di list */}
                    <div>
                      <select
                        value={pet.isAddingNewBreed ? BREED_NEW_OPTION : pet.breedId}
                        required={!pet.isAddingNewBreed}
                        className="p-2 border rounded-lg w-full"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === BREED_NEW_OPTION) {
                            handleBreedNewChange(idx, '');
                            return;
                          }
                          const selected = breedChoices.find((b) => b.id === val);
                          handleBreedChange(idx, val, selected?.name ?? '');
                        }}
                      >
                        <option value="">
                          {breedLoading[pet.type]
                            ? `${t.petBreed} (${t.breedLoadingLabel})`
                            : `— ${t.petBreed} —`}
                        </option>
                        {breedChoices.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                        <option value={BREED_NEW_OPTION}>{t.breedNewOption}</option>
                      </select>

                      {/* Text input muncul hanya saat customer pilih opsi "ras baru" */}
                      {pet.isAddingNewBreed && (
                        <input
                          type="text"
                          placeholder={t.breedNewPlaceholder}
                          required
                          value={pet.breedNew}
                          className="p-2 border rounded-lg w-full mt-2"
                          onChange={(e) => handleBreedNewChange(idx, e.target.value)}
                        />
                      )}
                    </div>

                    <input
                      type="date"
                      required
                      value={pet.dob}
                      className="p-2 border rounded-lg"
                      onChange={(e) => handlePetChange(idx, 'dob', e.target.value)}
                    />

                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder={t.petWeight}
                      required
                      value={pet.weight}
                      className="p-2 border rounded-lg"
                      onChange={(e) => handlePetChange(idx, 'weight', e.target.value)}
                    />
                  </div>

                  {/* Pertanyaan tambahan */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-dashed">
                    {/* Sudah pernah grooming sebelumnya? -> x_studio_first_grooming_experience_1 (boolean, polaritas terbalik: lihat komentar interface PetInput) */}
                    <div>
                      <label className="text-xs font-semibold text-[#5C3A21] block mb-1">
                        {t.quest1}
                      </label>
                      <div className="flex gap-3">
                        {(['Ya', 'Tidak'] as const).map((opt) => (
                          <label key={opt} className="flex items-center gap-1 text-sm">
                            <input
                              type="radio"
                              name={`hasGroomedBefore-${idx}`}
                              checked={pet.hasGroomedBefore === opt}
                              onChange={() => handlePetChange(idx, 'hasGroomedBefore', opt)}
                            />
                            {opt === 'Ya' ? t.yes : t.no}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* 2. Reaksi ke orang baru -> x_studio_reaksi_ke_manusia */}
                    <div>
                      <label className="text-xs font-semibold text-[#5C3A21] block mb-1">
                        {t.quest2}
                      </label>
                      <select
                        value={pet.behavior}
                        className="w-full p-2 border rounded-lg text-sm"
                        onChange={(e) =>
                          handlePetChange(idx, 'behavior', e.target.value as PetInput['behavior'])
                        }
                      >
                        {(Object.keys(t.behaviorOptions) as Array<keyof typeof t.behaviorOptions>).map(
                          (key) => (
                            <option key={key} value={key}>
                              {t.behaviorOptions[key]}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    {/* 3. Status vaksin -> x_studio_status_vaksin */}
                    <div>
                      <label className="text-xs font-semibold text-[#5C3A21] block mb-1">
                        {t.quest3}
                      </label>
                      <select
                        value={pet.vaccineStatus}
                        className="w-full p-2 border rounded-lg text-sm"
                        onChange={(e) =>
                          handlePetChange(
                            idx,
                            'vaccineStatus',
                            e.target.value as PetInput['vaccineStatus']
                          )
                        }
                      >
                        {(
                          Object.keys(t.vaccineOptions) as Array<keyof typeof t.vaccineOptions>
                        ).map((key) => (
                          <option key={key} value={key}>
                            {t.vaccineOptions[key]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Foto bukti vaksin -> x_studio_bukti_vaksin */}
                    <div>
                      <label className="text-xs font-semibold text-[#5C3A21] block mb-1">
                        {t.questPhoto}
                      </label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="w-full text-sm"
                        onChange={(e) =>
                          handlePetFileChange(idx, e.target.files ? e.target.files[0] : null)
                        }
                      />
                    </div>

                    {/* 4. Status alergi -> field baru (selection) */}
                    <div>
                      <label className="text-xs font-semibold text-[#5C3A21] block mb-1">
                        {t.quest4}
                      </label>
                      <select
                        value={pet.allergyStatus}
                        className="w-full p-2 border rounded-lg text-sm"
                        onChange={(e) =>
                          handlePetChange(
                            idx,
                            'allergyStatus',
                            e.target.value as PetInput['allergyStatus']
                          )
                        }
                      >
                        {(
                          Object.keys(t.allergyOptions) as Array<keyof typeof t.allergyOptions>
                        ).map((key) => (
                          <option key={key} value={key}>
                            {t.allergyOptions[key]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Detail alergi -> field baru (text), hanya muncul kalau bukan "Tidak Ada" */}
                    {pet.allergyStatus !== 'Tidak Ada' && (
                      <div>
                        <label className="text-xs font-semibold text-[#5C3A21] block mb-1">
                          {t.allergyDetailLabel}
                        </label>
                        <input
                          type="text"
                          value={pet.allergyDetail}
                          className="w-full p-2 border rounded-lg text-sm"
                          onChange={(e) => handlePetChange(idx, 'allergyDetail', e.target.value)}
                        />
                      </div>
                    )}

                    {/* Riwayat penyakit / catatan khusus -> x_studio_catatan */}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-semibold text-[#5C3A21] block mb-1">
                        {t.quest5}
                      </label>
                      <textarea
                        value={pet.medicalHistory}
                        className="w-full p-2 border rounded-lg text-sm"
                        rows={2}
                        onChange={(e) => handlePetChange(idx, 'medicalHistory', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5C3A21] text-white py-4 rounded-2xl font-semibold uppercase tracking-widest disabled:opacity-60"
            style={{ fontFamily: 'var(--font-fredoka), sans-serif' }}
          >
            {t.submitBtn}
          </button>

          {statusMessage && (
            <p
              className={`text-center text-sm font-semibold ${
                statusMessage.startsWith('❌') ? 'text-red-600' : 'text-green-700'
              }`}
            >
              {statusMessage}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}