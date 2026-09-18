import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipeSoal } from "@/types";

/**
 * Penyimpanan & pembacaan Bank Soal.
 *
 * ── APA ITU BANK SOAL DI SINI ──
 *
 * Arsip permanen semua soal yang pernah dibuat guru di satu jenjang,
 * lepas dari event/mapel asalnya. Setiap kali guru menyimpan soal, satu
 * salinannya otomatis masuk ke sini — guru tidak perlu menekan apa pun.
 * Nanti soal itu bisa dipanggil lagi ke event mana pun.
 *
 * Alasan menyimpannya SALINAN (bukan referensi) ada di komentar panjang
 * pada 0014_bank_soal.sql; ringkasnya: soal pada ujian yang sudah dinilai
 * tidak boleh ikut berubah ketika arsipnya diedit.
 *
 * ── SOAL BESAR-KECIL HURUF NAMA MAPEL ──
 *
 * Guru A mengetik "MATEMATIKA", guru B "Matematika". Kalau dianggap dua
 * mapel berbeda, bank soal jadi tidak ada gunanya — tidak ada guru yang
 * menemukan soal rekannya. Penyamaannya dikerjakan DATABASE lewat kolom
 * `mapel_nama_norm` (generated column), bukan di sini, supaya satu aturan
 * itu berlaku untuk semua jalur tulis termasuk impor manual. Fungsi
 * `normalisasiNamaMapel()` di bawah adalah cermin JavaScript dari aturan
 * yang sama, dipakai HANYA untuk menyaring/mencocokkan di sisi klien —
 * bukan untuk menulis.
 */

/** Cermin dari ekspresi `mapel_nama_norm` di 0014_bank_soal.sql. */
export function normalisasiNamaMapel(nama: string): string {
  return nama.replace(/\s+/g, " ").trim().toLowerCase();
}

export interface BarisBankSoal {
  id: string;
  mapel_nama: string;
  mapel_nama_norm: string;
  tipe: TipeSoal;
  skor: number;
  konten_jsonb: Record<string, unknown>;
  gambar_url: string | null;
  asal_soal_id: string | null;
  asal_event_nama: string | null;
  dibuat_oleh_nama: string | null;
  created_at: string;
}

export interface MapelBank {
  mapel_nama_norm: string;
  nama_tampil: string;
  jumlah: number;
}

export interface SimpanKeBankInput {
  mapelNama: string;
  tipe: TipeSoal;
  skor: number;
  kontenJsonb: Record<string, unknown>;
  gambarUrl: string | null;
  asalSoalId: string;
  asalEventNama: string | null;
  dibuatOleh: string | null;
  dibuatOlehNama: string | null;
}

/**
 * Salin satu soal ke bank.
 *
 * ── KENAPA KEGAGALANNYA TIDAK PERNAH DILEMPAR ──
 *
 * Fungsi ini dipanggil SETELAH soal berhasil masuk ke tabel `soal`.
 * Kalau penyalinan ke bank gagal (migrasi 0014 belum dijalankan di
 * project itu, RLS salah, jaringan putus), yang TIDAK BOLEH terjadi
 * adalah guru melihat pesan "gagal menyimpan soal" padahal soalnya
 * sudah tersimpan dengan benar — dia akan mengetik ulang soal yang sama
 * dan menghasilkan duplikat.
 *
 * Jadi kegagalan di sini dicatat ke konsol server lalu ditelan.
 * Bank soal adalah kemudahan tambahan; ujian yang sedang disiapkan
 * adalah yang utama, dan yang utama tidak boleh digagalkan oleh yang
 * tambahan.
 *
 * Mengembalikan `true` kalau berhasil, supaya pemanggil bisa memilih
 * menampilkan keterangan "sekaligus tersimpan di bank soal" hanya kalau
 * memang benar tersimpan.
 */
export async function simpanKeBankSoal(
  client: SupabaseClient,
  input: SimpanKeBankInput
): Promise<boolean> {
  try {
    const { error } = await client.from("bank_soal").upsert(
      {
        mapel_nama: input.mapelNama,
        tipe: input.tipe,
        skor: input.skor,
        konten_jsonb: input.kontenJsonb,
        gambar_url: input.gambarUrl,
        asal_soal_id: input.asalSoalId,
        asal_event_nama: input.asalEventNama,
        dibuat_oleh: input.dibuatOleh,
        dibuat_oleh_nama: input.dibuatOlehNama,
      },
      {
        // Guru menyimpan, sadar ada typo, memperbaiki, menyimpan lagi.
        // Tanpa `onConflict` bank berisi dua salinan — satu dengan typo —
        // dan guru berikutnya tidak punya cara tahu mana yang benar.
        onConflict: "asal_soal_id",
      }
    );

    if (error) {
      console.error("[bank-soal] gagal menyalin soal ke bank:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[bank-soal] gagal menyalin soal ke bank:", e);
    return false;
  }
}

/** Daftar mapel yang ada isinya di bank, sudah digabung per ejaan. */
export async function daftarMapelBank(
  client: SupabaseClient
): Promise<MapelBank[]> {
  const { data, error } = await client.rpc("get_bank_soal_mapel");
  if (error) {
    console.error("[bank-soal] get_bank_soal_mapel gagal:", error.message);
    return [];
  }
  return (data as MapelBank[]) ?? [];
}

export interface FilterBank {
  /** `mapel_nama_norm` — dari daftar di atas, bukan ketikan bebas. */
  mapelNorm?: string | null;
  /** Kata kunci bebas; dicocokkan ke seluruh isi konten soal. */
  cari?: string | null;
  tipe?: TipeSoal | null;
  limit?: number;
}

/**
 * Cari soal di bank.
 *
 * Pencarian memakai `konten_jsonb::text ilike` — seluruh JSON soal,
 * bukan cuma field pertanyaannya. Ini disengaja: bentuk konten berbeda
 * per tipe (pertanyaan bisa ada di `pertanyaan` atau `instruksi`, dan
 * teks penting juga ada di dalam array opsi), dan guru yang mencari
 * "fotosintesis" tetap ingin menemukan soal yang menyebut kata itu di
 * salah satu opsi jawabannya.
 *
 * Konsekuensi yang perlu diketahui: karena yang dicari adalah JSON
 * mentah, mengetik nama field (mis. "pertanyaan") akan cocok dengan
 * semua baris. Itu bukan masalah dalam praktiknya — tidak ada guru yang
 * mencari begitu — dan harganya jauh lebih murah daripada memelihara
 * kolom teks turunan yang harus disinkronkan setiap kali bentuk konten
 * bertambah.
 */
export async function cariBankSoal(
  client: SupabaseClient,
  filter: FilterBank
): Promise<BarisBankSoal[]> {
  let q = client
    .from("bank_soal")
    .select(
      "id, mapel_nama, mapel_nama_norm, tipe, skor, konten_jsonb, gambar_url, asal_soal_id, asal_event_nama, dibuat_oleh_nama, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);

  if (filter.mapelNorm) {
    q = q.eq("mapel_nama_norm", filter.mapelNorm);
  }
  if (filter.tipe) {
    q = q.eq("tipe", filter.tipe);
  }
  if (filter.cari && filter.cari.trim()) {
    const kata = filter.cari.trim();
    // `%` dan `_` di ketikan guru harus di-escape, kalau tidak
    // mengetik "50%" berubah jadi pola cocok-apa-saja.
    const aman = kata.replace(/[%_\\]/g, (c) => `\\${c}`);
    // `::text` WAJIB. `konten_jsonb` bertipe jsonb, dan `ilike` adalah
    // operator teks — tanpa cast, PostgREST menolak filternya dengan
    // error tipe, dan pencariannya tidak pernah mengembalikan apa pun.
    // PostgREST mendukung cast di sisi kolom persis dengan sintaks ini.
    q = q.ilike("konten_jsonb::text", `%${aman}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[bank-soal] pencarian gagal:", error.message);
    return [];
  }
  return (data as BarisBankSoal[]) ?? [];
}

/**
 * Salin sekumpulan soal dari bank ke satu mapel.
 *
 * `urutan` melanjutkan nomor terakhir yang sudah ada di mapel tujuan —
 * soal yang diambil dari bank masuk di BAWAH soal yang sudah ada, bukan
 * menimpanya. Dikerjakan sekali di awal lalu dihitung maju, bukan query
 * ulang per soal, supaya mengambil 40 soal sekaligus tidak jadi 40
 * perjalanan bolak-balik ke database.
 */
export async function gunakanBankSoal(
  client: SupabaseClient,
  bankIds: string[],
  mapelIdTujuan: string
): Promise<{ jumlah: number; error: string | null }> {
  if (bankIds.length === 0) {
    return { jumlah: 0, error: "Belum ada soal yang dipilih." };
  }

  const { data: bankRows, error: bacaError } = await client
    .from("bank_soal")
    .select("id, tipe, skor, konten_jsonb, gambar_url")
    .in("id", bankIds);

  if (bacaError || !bankRows || bankRows.length === 0) {
    return { jumlah: 0, error: "Soal yang dipilih tidak ditemukan di bank." };
  }

  const { count } = await client
    .from("soal")
    .select("id", { count: "exact", head: true })
    .eq("mapel_id", mapelIdTujuan);

  let urutan = count ?? 0;

  const barisBaru = bankRows.map((b) => ({
    mapel_id: mapelIdTujuan,
    tipe: b.tipe,
    urutan: ++urutan,
    skor: b.skor,
    konten_jsonb: b.konten_jsonb,
    gambar_url: b.gambar_url,
  }));

  const { error: tulisError } = await client.from("soal").insert(barisBaru);

  if (tulisError) {
    return { jumlah: 0, error: "Gagal menyalin soal ke mapel. Coba lagi." };
  }

  return { jumlah: barisBaru.length, error: null };
}
