/**
 * Aturan TUGAS yang murni perhitungan — tanpa Supabase, tanpa
 * `next/headers`, tanpa React. Semuanya bisa diimpor dari server, client,
 * maupun berkas uji (lihat `src/lib/__tests__/tugas.test.ts`).
 *
 * ── KENAPA SEMUA INI DIPUSATKAN DI SATU BERKAS ──
 *
 * Pertanyaan "boleh mengumpulkan atau tidak" dijawab di TIGA tempat yang
 * berbeda, dan ketiganya harus menjawab hal yang sama:
 *
 *   1. RLS di database (0019)        — yang mengikat.
 *   2. Server Action `kumpulkanTugas` — supaya pesan errornya ramah.
 *   3. Tombol di layar siswa          — supaya tombolnya tidak menipu.
 *
 * Nomor 1 ditulis dalam SQL dan memang harus berdiri sendiri. Nomor 2 dan
 * 3 memakai fungsi di berkas ini, jadi paling tidak keduanya tidak bisa
 * saling bertentangan. Kalau aturannya berubah, yang perlu diubah cuma
 * dua tempat (SQL + berkas ini), dan uji di berkas ini yang akan berteriak
 * kalau salah satunya lupa.
 *
 * ── SATU LAGI: WAKTU SELALU DIOPER, TIDAK PERNAH DIBACA SENDIRI ──
 *
 * Tidak ada satu pun fungsi di sini yang memanggil `Date.now()` diam-diam.
 * `sekarang` selalu parameter. Alasannya sama dengan yang sudah dipakai
 * dashboard siswa: jam HP siswa tidak bisa dipercaya, jadi yang dipakai
 * adalah jam server yang sudah dikoreksi — dan itu hanya mungkin kalau
 * fungsi-fungsi ini menerima jamnya, bukan mengambilnya sendiri. Efek
 * sampingnya menyenangkan: semuanya jadi bisa diuji tanpa menyentuh jam
 * sistem sama sekali.
 */

/** Bentuk minimal tugas yang dibutuhkan perhitungan di berkas ini. */
export interface TugasWaktu {
  dibuka_at: string;
  tenggat: string;
  izinkan_terlambat: boolean;
}

/** Bentuk minimal pengumpulan yang dibutuhkan perhitungan di berkas ini. */
export interface PengumpulanRingkas {
  teks?: string | null;
  berkas_path?: string | null;
  submitted_at: string | null;
  nilai: number | null;
}

export type FaseTugas = "belum_dibuka" | "berjalan" | "lewat_tenggat";

/**
 * Fase tugas menurut jam. Perhatikan `lewat_tenggat` TIDAK otomatis
 * berarti "tertutup" — tugas dengan `izinkan_terlambat` tetap menerima
 * pengumpulan di fase ini, cuma ditandai terlambat. Pertanyaan "masih
 * boleh mengumpulkan?" dijawab `bolehMengumpulkan()`, bukan oleh fase.
 */
export function faseTugas(tugas: TugasWaktu, sekarang: number): FaseTugas {
  if (sekarang < new Date(tugas.dibuka_at).getTime()) return "belum_dibuka";
  if (sekarang > new Date(tugas.tenggat).getTime()) return "lewat_tenggat";
  return "berjalan";
}

export function bolehMengumpulkan(
  tugas: TugasWaktu,
  sekarang: number
): boolean {
  const fase = faseTugas(tugas, sekarang);
  if (fase === "belum_dibuka") return false;
  if (fase === "berjalan") return true;
  return tugas.izinkan_terlambat;
}

/** Alasan pintu tertutup, dalam kalimat yang bisa langsung ditempel di UI
 *  maupun dikembalikan Server Action. `null` = pintunya terbuka. */
export function alasanTidakBolehMengumpulkan(
  tugas: TugasWaktu,
  sekarang: number
): string | null {
  const fase = faseTugas(tugas, sekarang);
  if (fase === "belum_dibuka") {
    return "Tugas ini belum dibuka. Tunggu sampai waktu mulainya tiba.";
  }
  if (fase === "lewat_tenggat" && !tugas.izinkan_terlambat) {
    return "Tenggat tugas ini sudah lewat dan guru menutup pengumpulan terlambat.";
  }
  return null;
}

/**
 * Status pengumpulan dan keterlambatan adalah DUA SUMBU TERPISAH, bukan
 * satu daftar berisi lima nilai. Pengumpulan bisa sekaligus "dinilai" DAN
 * "terlambat"; kalau keduanya dijejalkan ke satu enum, salah satunya pasti
 * hilang di layar — dan yang biasanya hilang adalah tanda terlambat,
 * justru yang paling ingin dilihat guru saat merekap.
 */
export type StatusPengumpulan = "belum" | "draf" | "terkumpul" | "dinilai";

export interface RingkasPengumpulan {
  status: StatusPengumpulan;
  /** Hanya bermakna kalau `status` bukan "belum"/"draf". */
  terlambat: boolean;
}

export function ringkasPengumpulan(
  pengumpulan: PengumpulanRingkas | null | undefined,
  tenggat: string
): RingkasPengumpulan {
  if (!pengumpulan) return { status: "belum", terlambat: false };

  if (!pengumpulan.submitted_at) {
    // Baris ada tapi belum disubmit. Kalau isinya juga kosong, itu baris
    // sisa (mis. siswa membuka halaman lalu menutupnya) — untuk guru itu
    // sama saja dengan belum mengumpulkan, jadi jangan tampilkan "draf"
    // dan membuatnya mengira ada yang perlu dibaca.
    const adaIsi =
      Boolean(pengumpulan.teks && pengumpulan.teks.trim() !== "") ||
      Boolean(pengumpulan.berkas_path);
    return { status: adaIsi ? "draf" : "belum", terlambat: false };
  }

  const terlambat =
    new Date(pengumpulan.submitted_at).getTime() >
    new Date(tenggat).getTime();

  return {
    status: pengumpulan.nilai === null ? "terkumpul" : "dinilai",
    terlambat,
  };
}

export const LABEL_STATUS_PENGUMPULAN: Record<StatusPengumpulan, string> = {
  belum: "Belum mengumpulkan",
  draf: "Draf tersimpan",
  terkumpul: "Menunggu dinilai",
  dinilai: "Sudah dinilai",
};

/**
 * Hitung papan angka satu tugas. Dipakai di kartu ringkas halaman detail
 * tugas dan di daftar tugas per event.
 *
 * `target` dioper terpisah, bukan diambil dari panjang `daftar`, karena
 * siswa yang BELUM MENYENTUH tugas sama sekali tidak punya baris
 * `pengumpulan_tugas` — dia tidak akan muncul di `daftar`. Kalau targetnya
 * diambil dari panjang daftar, angka "12 dari 12 sudah mengumpulkan" akan
 * tampil di kelas berisi 32 anak, dan itu kabar baik yang palsu.
 */
export interface PapanTugas {
  target: number;
  terkumpul: number;
  terlambat: number;
  dinilai: number;
  belum: number;
  rataRata: number | null;
}

export function papanTugas(
  daftar: PengumpulanRingkas[],
  tenggat: string,
  target: number
): PapanTugas {
  let terkumpul = 0;
  let terlambat = 0;
  let dinilai = 0;
  let totalNilai = 0;

  for (const p of daftar) {
    const r = ringkasPengumpulan(p, tenggat);
    if (r.status === "terkumpul" || r.status === "dinilai") {
      terkumpul += 1;
      if (r.terlambat) terlambat += 1;
    }
    if (r.status === "dinilai" && p.nilai !== null) {
      dinilai += 1;
      totalNilai += p.nilai;
    }
  }

  return {
    target,
    terkumpul,
    terlambat,
    dinilai,
    belum: Math.max(0, target - terkumpul),
    rataRata: dinilai === 0 ? null : totalNilai / dinilai,
  };
}

/**
 * Validasi angka nilai yang diketik guru. Mengembalikan pesan error, atau
 * `null` kalau sah. String kosong SAH dan berarti "batalkan penilaian"
 * (kembalikan ke belum dinilai) — itu satu-satunya cara guru memberi
 * kesempatan perbaikan, karena RLS mengunci baris yang sudah bernilai dari
 * perubahan oleh siswa.
 */
export function validasiNilai(
  raw: string,
  skorMaksimal: number
): string | null {
  const bersih = raw.trim();
  if (bersih === "") return null;

  const n = Number(bersih.replace(",", "."));
  if (!Number.isFinite(n)) {
    return "Nilai harus berupa angka, atau dikosongkan untuk membatalkan penilaian.";
  }
  if (n < 0) {
    return "Nilai tidak boleh negatif.";
  }
  if (n > skorMaksimal) {
    return `Nilai melebihi skor maksimal tugas ini (${skorMaksimal}). Naikkan skor maksimalnya lewat Edit Tugas kalau memang disengaja.`;
  }
  return null;
}

/** Pasangan `validasiNilai` — panggil hanya setelah validasi lolos. */
export function parseNilai(raw: string): number | null {
  const bersih = raw.trim();
  if (bersih === "") return null;
  return Number(bersih.replace(",", "."));
}

/**
 * "2 hari 3 jam" / "3 jam 12 menit" / "45 menit" / "kurang dari semenit".
 *
 * Menggantikan `formatSisaSingkat` lokal yang sebelumnya hidup di
 * `DashboardSiswaClient.tsx` — dipindah ke sini supaya kartu ujian dan
 * kartu tugas memakai satuan yang sama persis. Dua fungsi kembar di dua
 * berkas adalah cara termudah untuk berakhir dengan "2 hari" di satu
 * kartu dan "51 jam" di kartu sebelahnya.
 *
 * Satu perilaku lama dipertahankan apa adanya: `ms <= 0` menghasilkan
 * "sebentar lagi", bukan "sudah lewat". Fungsi ini dipakai dalam kalimat
 * "akan terbuka dalam ___", dan "akan terbuka dalam sudah lewat" adalah
 * kalimat yang tidak bisa dibaca siapa pun. Pemanggil yang perlu
 * membedakan keterlambatan memeriksa tanda `ms` sendiri — itu yang
 * dilakukan kartu tugas.
 *
 * Yang BERUBAH dari versi lama: sisa waktu lebih dari sehari kini ditulis
 * dalam hari ("2 hari 3 jam"), bukan puluhan jam ("51 jam"). Tenggat
 * tugas berjarak berhari-hari, tidak seperti jendela ujian yang berjarak
 * jam — dan "51 jam" menuntut pembacanya membagi dengan 24 di kepala.
 */
export function formatSisaSingkat(ms: number): string {
  if (ms <= 0) return "sebentar lagi";
  const totalMenit = Math.ceil(ms / 60000);
  const hari = Math.floor(totalMenit / 1440);
  if (hari >= 1) {
    const sisaJam = Math.floor((totalMenit - hari * 1440) / 60);
    return sisaJam === 0 ? `${hari} hari` : `${hari} hari ${sisaJam} jam`;
  }
  const jam = Math.floor(totalMenit / 60);
  const menit = totalMenit % 60;
  if (jam === 0) return menit <= 0 ? "kurang dari semenit" : `${menit} menit`;
  return menit === 0 ? `${jam} jam` : `${jam} jam ${menit} menit`;
}

/** Tanggal + jam gaya Indonesia, zona Asia/Jakarta. Dipakai di kedua sisi
 *  (guru & siswa) supaya tenggat yang sama tidak pernah tampil berbeda. */
export function formatTenggat(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * ISO -> nilai untuk `<input type="datetime-local">` ("2026-09-21T08:00").
 *
 * ── KENAPA TANPA `timeZone` EKSPLISIT, PADAHAL SELURUH APLIKASI INI
 *    MENAMPILKAN WAKTU DALAM Asia/Jakarta ──
 *
 * `<input type="datetime-local">` mengirim string POLOS tanpa zona. Server
 * Action menafsirkannya dengan `new Date(string)`, yang memakai zona waktu
 * PROSES SERVER. Jadi supaya angka yang dibaca guru sama dengan angka yang
 * tersimpan, yang dipakai untuk MENAMPILKAN harus zona yang sama dengan
 * yang dipakai untuk MEMBACA — yaitu zona server, bukan zona yang
 * dipaksakan.
 *
 * Kalau di sini dipaksa `timeZone: "Asia/Jakarta"` sementara servernya
 * berjalan di UTC, guru akan membuka form yang menampilkan "08.00",
 * menekan Simpan tanpa mengubah apa pun, dan tenggatnya diam-diam
 * bergeser tujuh jam. Bug jenis itu tidak pernah terlihat saat dites di
 * laptop yang jamnya memang WIB.
 *
 * Konsekuensinya satu, dan harus dipenuhi saat deploy: PROSES SERVER
 * WAJIB BERJALAN DI Asia/Jakarta (`TZ=Asia/Jakarta`). Itu syarat yang
 * sudah berlaku sejak mesin ujian — `createMapel` menafsirkan jadwal mapel
 * dengan cara yang sama persis. Fungsi ini sengaja tidak "memperbaiki"
 * sepihak apa yang di tempat lain dibiarkan apa adanya; dua mesin yang
 * menafsirkan jam dengan aturan berbeda jauh lebih berbahaya daripada
 * satu aturan yang konsisten dan ditulis terang-terangan.
 *
 * WAJIB DIPANGGIL DARI SERVER COMPONENT, bukan dari komponen client —
 * di browser, "zona lokal" adalah zona HP siswa/guru, dan seluruh alasan
 * di atas langsung runtuh.
 */
export function untukInputDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function formatUkuranBerkas(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
