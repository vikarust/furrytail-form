'use client';

import { useState } from 'react';
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

// Tipe sudah disesuaikan agar value-nya match 1:1 dengan selection options di Odoo (x_pets)
interface PetInput {
  name: string; // -> x_name
  type: 'Anjing' | 'Kucing'; // -> x_studio_jenis_pet
  dob: string; // -> x_studio_tanggal_lahir_1
  breed: string; // -> x_studio_ras_pet_1 (many2one ke x_ras_pet). Disimpan sebagai breedId (string id record) di form; breedLabel hanya untuk tampilan dropdown.
  breedId: string; // id record x_ras_pet yang dipilih dari dropdown
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

// Daftar ras sementara (idealnya di-fetch dari model x_ras_pet via JSON-RPC di Phase 3b)
interface BreedOption {
  id: string;
  label: string;
  species: 'Anjing' | 'Kucing';
}

const BREED_OPTIONS: BreedOption[] = [
  { id: '', label: '— Pilih Ras —', species: 'Anjing' },
  { id: '', label: '— Pilih Ras —', species: 'Kucing' },
  { id: 'local_dog', label: 'Lokal / Kampung', species: 'Anjing' },
  { id: 'poodle', label: 'Poodle', species: 'Anjing' },
  { id: 'shihtzu', label: 'Shih Tzu', species: 'Anjing' },
  { id: 'pomeranian', label: 'Pomeranian', species: 'Anjing' },
  { id: 'golden_retriever', label: 'Golden Retriever', species: 'Anjing' },
  { id: 'chihuahua', label: 'Chihuahua', species: 'Anjing' },
  { id: 'local_cat', label: 'Lokal / Kampung', species: 'Kucing' },
  { id: 'persian', label: 'Persia', species: 'Kucing' },
  { id: 'maine_coon', label: 'Maine Coon', species: 'Kucing' },
  { id: 'sphynx', label: 'Sphynx', species: 'Kucing' },
  { id: 'lainnya', label: 'Lainnya', species: 'Anjing' },
];

const emptyPet = (): PetInput => ({
  name: '',
  type: 'Anjing',
  dob: '',
  breed: '',
  breedId: '',
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
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [address, setAddress] = useState('');
  const [mapLink, setMapLink] = useState('');

  const [pets, setPets] = useState<PetInput[]>([emptyPet()]);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const dict = {
    id: {
      title: 'Pendaftaran Pelanggan & Hewan Baru',
      subtitle: 'Furrytail Pet Grooming Salon & Dog Hotel',
      ownerSection: '👤 1. Data Pemilik (Owner)',
      ownerName: 'Nama Lengkap Pemilik *',
      ownerPhone: 'No. WhatsApp / Telepon *',
      ownerEmail: 'Email',
      ownerInstagram: 'Instagram (username)',
      addressLabel: 'Alamat Rumah *',
      mapsLabel: 'Link Google Maps Alamat Rumah *',
      petSection: '🐾 2. Informasi Hewan Peliharaan (Pets)',
      addPetBtn: '+ Tambah Hewan',
      deletePetBtn: 'Hapus',
      petName: 'Nama Hewan *',
      petType: 'Jenis *',
      petGender: 'Gender *',
      petBreed: 'Ras Hewan *',
      petDob: 'Tanggal Lahir *',
      petWeight: 'Berat (kg) *',
      quest1: 'Apakah sudah pernah grooming sebelumnya?',
      quest2: '2. Reaksi ke orang baru?',
      quest3: 'Status Vaksin *',
      questPhoto: 'Foto Bukti Vaksin',
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
      ownerSection: '👤 1. Owner Information',
      ownerName: 'Full Name *',
      ownerPhone: 'WhatsApp / Phone *',
      ownerEmail: 'Email',
      ownerInstagram: 'Instagram (username)',
      addressLabel: 'Home Address *',
      mapsLabel: 'Google Maps Link *',
      petSection: '🐾 2. Pets Information',
      addPetBtn: '+ Add Pet',
      deletePetBtn: 'Remove',
      petName: 'Pet Name *',
      petType: 'Type *',
      petGender: 'Gender *',
      petBreed: 'Breed *',
      petDob: 'Date of Birth *',
      petWeight: 'Weight (kg) *',
      quest1: 'Has this pet been groomed before?',
      quest2: '2. Reaction to strangers?',
      quest3: 'Vaccine Status *',
      questPhoto: 'Vaccine Proof Photo',
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
    const newPets = [...pets];
    newPets[index] = { ...newPets[index], [field]: value };

    // Reset ras hewan kalau jenis pet diganti (Anjing <-> Kucing), karena daftar ras berbeda
    if (field === 'type') {
      newPets[index].breedId = '';
      newPets[index].breed = '';
    }

    setPets(newPets);
  };

  const handlePetFileChange = (index: number, file: File | null) => {
    const newPets = [...pets];
    newPets[index] = { ...newPets[index], vaccinePhoto: file };
    setPets(newPets);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Logika kirim ke API Odoo menggunakan FormData / JSON-RPC (Phase 3b)
    setLoading(false);
    setStatusMessage(lang === 'id' ? '✅ Data Berhasil Disimpan!' : '✅ Data Saved Successfully!');
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
          {/* === 1. Data Pemilik === */}
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
                required
                value={address}
                className="w-full p-3 rounded-xl border md:col-span-2"
                onChange={(e) => setAddress(e.target.value)}
              />
              <input
                type="url"
                placeholder={t.mapsLabel}
                required
                value={mapLink}
                className="w-full p-3 rounded-xl border md:col-span-2"
                onChange={(e) => setMapLink(e.target.value)}
              />
            </div>
          </div>

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
              const breedChoices = BREED_OPTIONS.filter((b) => b.species === pet.type);

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
                      <option value="Anjing">Anjing</option>
                      <option value="Kucing">Kucing</option>
                    </select>

                    <select
                      value={pet.gender}
                      className="p-2 border rounded-lg"
                      onChange={(e) =>
                        handlePetChange(idx, 'gender', e.target.value as PetInput['gender'])
                      }
                    >
                      <option value="Jantan">Jantan</option>
                      <option value="Betina">Betina</option>
                    </select>

                    {/* Ras: dropdown, sesuai x_studio_ras_pet_1 (many2one -> x_ras_pet) */}
                    <select
                      value={pet.breedId}
                      required
                      className="p-2 border rounded-lg"
                      onChange={(e) => {
                        const selected = breedChoices.find((b) => b.id === e.target.value);
                        handlePetChange(idx, 'breedId', e.target.value);
                        handlePetChange(idx, 'breed', selected?.label ?? '');
                      }}
                    >
                      <option value="">— {t.petBreed} —</option>
                      {breedChoices
                        .filter((b) => b.id !== '')
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.label}
                          </option>
                        ))}
                    </select>

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
            <p className="text-center text-sm font-semibold text-green-700">{statusMessage}</p>
          )}
        </form>
      </div>
    </div>
  );
}