/**
 * Bot uji fitur checkout. Panduan: docs/UJI-CHECKOUT.md
 *
 *   npx tsx scripts/bot-uji-checkout.ts --kelas 8              (rencana saja)
 *   npx tsx scripts/bot-uji-checkout.ts --kelas 8 --jalankan   (uji sungguhan)
 *   npx tsx scripts/bot-uji-checkout.ts --kelas 8 --bersihkan  (hapus sisa data)
 *
 * Bot membuat kelas, kegiatan, mapel, dan 4 akun siswa sementara di project
 * jenjang itu, login sebagai siswa lewat anon key (jalur yang sama dengan HP
 * siswa), memeriksa aturan checkout, lalu menghapus semuanya. Semua data
 * memakai awalan AWALAN, dan pembersihan hanya menyentuh data berawalan itu.
 * Siswa asli tidak melihat apa pun karena mapelnya hanya ditarget ke kelas bot.
 *
 * Jadwal dilompati dengan mengubah `mapel.waktu_selesai`, jadi tidak perlu
 * menunggu sampai jendela buka.
 */
import { randomBytes } from "node:crypto";
import { config as muatEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  catatanCheckout,
  checkoutSatuSiswa,
  muatCheckoutMapel,
} from "@/lib/checkout";

muatEnv({ path: ".env.local" });

const AWALAN = "BOT-UJI-CHECKOUT";
const DOMAIN_EMAIL = "bot-uji-checkout.invalid";
const OPSI_KLIEN = {
  auth: { autoRefreshToken: false, persistSession: false },
};

interface Akun {
  label: string;
  siswaId: string;
  klien: SupabaseClient;
}

const argumen = process.argv.slice(2);
const kelas = Number(argumen[argumen.indexOf("--kelas") + 1]);

function wajibEnv(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`${nama} belum ada di .env.local`);
  return nilai;
}

let lulus = 0;
let gagal = 0;

function cek(nama: string, benar: boolean, rincian = "") {
  if (benar) lulus++;
  else gagal++;
  console.log(`${benar ? "  LULUS" : "  GAGAL"}  ${nama}${rincian ? ` (${rincian})` : ""}`);
}

function bagian(judul: string) {
  console.log(`\n${judul}`);
}

function pastikan<T>(hasil: { data: T; error: { message: string } | null }, langkah: string): T {
  if (hasil.error) throw new Error(`${langkah}: ${hasil.error.message}`);
  return hasil.data;
}

/** Hanya menyentuh data berawalan AWALAN / email domain bot. */
async function bersihkan(admin: SupabaseClient) {
  const { data: kelasBot } = await admin
    .from("kelas")
    .select("id")
    .like("nama", `${AWALAN}%`);
  const kelasIds = (kelasBot ?? []).map((k) => k.id as string);

  const { data: siswaBot } = kelasIds.length
    ? await admin.from("siswa").select("id, auth_id").in("kelas_id", kelasIds)
    : { data: [] };
  const siswaIds = (siswaBot ?? []).map((s) => s.id as string);

  const { data: eventBot } = await admin
    .from("event")
    .select("id")
    .like("nama", `${AWALAN}%`);
  const eventIds = (eventBot ?? []).map((e) => e.id as string);

  const { data: mapelBot } = eventIds.length
    ? await admin.from("mapel").select("id").in("event_id", eventIds)
    : { data: [] };
  const mapelIds = (mapelBot ?? []).map((m) => m.id as string);

  if (siswaIds.length) {
    await admin.from("nilai").delete().in("siswa_id", siswaIds);
    await admin.from("jawaban_siswa").delete().in("siswa_id", siswaIds);
    await admin.from("siswa").delete().in("id", siswaIds);
  }
  if (eventIds.length) await admin.from("event").delete().in("id", eventIds);
  if (kelasIds.length) await admin.from("kelas").delete().in("id", kelasIds);

  const idLog = [...eventIds, ...mapelIds];
  if (idLog.length) {
    await admin.from("log_aktivitas").delete().in("entitas_id", idLog);
  }

  const { data: akun } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const akunBot = (akun?.users ?? []).filter((u) =>
    u.email?.endsWith(`@${DOMAIN_EMAIL}`)
  );
  for (const u of akunBot) await admin.auth.admin.deleteUser(u.id);

  const { count } = await admin
    .from("kelas")
    .select("id", { count: "exact", head: true })
    .like("nama", `${AWALAN}%`);
  const { count: sisaEvent } = await admin
    .from("event")
    .select("id", { count: "exact", head: true })
    .like("nama", `${AWALAN}%`);
  const sisa = (count ?? 0) + (sisaEvent ?? 0);
  console.log(
    sisa === 0
      ? `\nPembersihan selesai: ${siswaIds.length} siswa bot, ${eventIds.length} kegiatan bot dihapus.`
      : `\nPERINGATAN: masih ada ${sisa} data bot. Jalankan lagi dengan --bersihkan.`
  );
}

async function buatAkun(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  label: string,
  kelasId: string,
  akhiran: string
): Promise<Akun> {
  const email = `${label.toLowerCase()}-${akhiran}@${DOMAIN_EMAIL}`;
  const password = randomBytes(18).toString("hex");

  const { data: dibuat, error: errAkun } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errAkun || !dibuat.user) {
    throw new Error(`buat akun ${label}: ${errAkun?.message}`);
  }

  const siswa = pastikan(
    await admin
      .from("siswa")
      .insert({
        auth_id: dibuat.user.id,
        nama: `${AWALAN} ${label}`,
        kelas_id: kelasId,
        username: `bot_${label.toLowerCase()}_${akhiran}`,
      })
      .select("id")
      .single(),
    `buat siswa ${label}`
  ) as { id: string };

  const klien = createClient(url, anonKey, OPSI_KLIEN);
  const { error } = await klien.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${label}: ${error.message}`);

  return { label, siswaId: siswa.id, klien };
}

async function jalankanUji(admin: SupabaseClient, url: string, anonKey: string) {
  const akhiran = randomBytes(3).toString("hex");
  const menitDariSekarang = (m: number) =>
    new Date(Date.now() + m * 60_000).toISOString();
  const hariIni = new Date().toISOString().slice(0, 10);

  bagian("Menyiapkan data sementara");
  const kelasBot = pastikan(
    await admin
      .from("kelas")
      .insert({ tingkat: kelas, nama: `${AWALAN}-${akhiran}` })
      .select("id")
      .single(),
    "buat kelas"
  ) as { id: string };

  const eventBot = pastikan(
    await admin
      .from("event")
      .insert({
        nama: `${AWALAN}-${akhiran}`,
        tgl_mulai: hariIni,
        tgl_selesai: hariIni,
        kelas_utama: kelas,
      })
      .select("id")
      .single(),
    "buat kegiatan"
  ) as { id: string };

  const mapel = pastikan(
    await admin
      .from("mapel")
      .insert({
        event_id: eventBot.id,
        nama: `${AWALAN} IPA`,
        waktu_mulai: menitDariSekarang(-30),
        waktu_selesai: menitDariSekarang(60),
      })
      .select("id, checkout_wajib")
      .single(),
    "buat mapel"
  ) as { id: string; checkout_wajib: boolean };

  pastikan(
    await admin
      .from("mapel_kelas")
      .insert({ mapel_id: mapel.id, kelas_id: kelasBot.id }),
    "tautkan kelas"
  );

  const [a, b, c, d] = await Promise.all(
    ["A", "B", "C", "D"].map((label) =>
      buatAkun(admin, url, anonKey, label, kelasBot.id, akhiran)
    )
  );
  console.log("  4 siswa bot login, mapel bot dibuat.");

  const ubahTutup = async (waktu: string) => {
    pastikan(
      await admin.from("mapel").update({ waktu_selesai: waktu }).eq("id", mapel.id),
      "ubah jadwal"
    );
  };
  const daftar = async (s: Akun) => {
    const { data, error } = await s.klien.rpc("get_checkout_siswa");
    if (error) throw new Error(`daftar ${s.label}: ${error.message}`);
    return (data ?? []) as {
      mapel_id: string;
      buka_at: string;
      tutup_at: string;
      sudah_kumpul: boolean;
    }[];
  };
  const checkout = (s: Akun, masihDiRuang: boolean) =>
    s.klien.rpc("checkout_ujian_siswa", {
      p_mapel_id: mapel.id,
      p_masih_di_ruang: masihDiRuang,
    });
  const mulai = async (s: Akun) => {
    pastikan(
      await s.klien.rpc("mulai_ujian", { p_mapel_id: mapel.id }),
      `mulai ${s.label}`
    );
  };
  const kumpul = async (s: Akun) => {
    pastikan(
      await s.klien
        .from("jawaban_siswa")
        .update({ submitted_at: new Date().toISOString() })
        .eq("siswa_id", s.siswaId)
        .eq("mapel_id", mapel.id),
      `kumpul ${s.label}`
    );
  };
  const barisCheckout = async (s: Akun) =>
    pastikan(
      await admin
        .from("checkout_ujian")
        .select("masih_di_ruang")
        .eq("siswa_id", s.siswaId)
        .eq("mapel_id", mapel.id),
      "baca checkout"
    ) as { masih_di_ruang: boolean }[];

  bagian("1. Sebelum jendela buka");
  cek("mapel baru otomatis wajib checkout", mapel.checkout_wajib === true);

  const anon = createClient(url, anonKey, OPSI_KLIEN);
  const hasilAnon = await anon.rpc("get_checkout_siswa");
  cek("pengunjung tanpa login ditolak", hasilAnon.error !== null);

  cek("siswa belum mulai: daftar kosong", (await daftar(a)).length === 0);
  const belumMulai = await checkout(a, true);
  cek(
    "siswa belum mulai: checkout ditolak",
    belumMulai.error?.message.includes("belum memulai") === true,
    belumMulai.error?.message
  );

  await mulai(a);
  const daftarA = await daftar(a);
  cek("setelah mulai, mapel masuk daftar", daftarA.length === 1);
  const selisihMenit =
    (new Date(daftarA[0].tutup_at).getTime() -
      new Date(daftarA[0].buka_at).getTime()) /
    60_000;
  cek("jendela buka tepat 5 menit sebelum tutup", selisihMenit === 5);

  const terlaluAwal = await checkout(a, true);
  cek(
    "checkout terlalu awal ditolak",
    terlaluAwal.error?.message.includes("belum dibuka") === true,
    terlaluAwal.error?.message
  );

  const tulisLangsung = await a.klien.from("checkout_ujian").insert({
    siswa_id: a.siswaId,
    mapel_id: mapel.id,
    masih_di_ruang: true,
  });
  cek("siswa tidak bisa menulis langsung ke tabel", tulisLangsung.error !== null);

  bagian("2. Saat jendela buka");
  await mulai(b);
  await mulai(c);
  await kumpul(b);
  await kumpul(c);
  await ubahTutup(menitDariSekarang(3));

  cek("checkout YA diterima", (await checkout(a, true)).error === null);
  cek("sudah checkout: hilang dari daftar", (await daftar(a)).length === 0);
  await checkout(a, false);
  const barisA = await barisCheckout(a);
  cek(
    "kirim ulang tidak mengubah jawaban pertama",
    barisA.length === 1 && barisA[0].masih_di_ruang === true
  );

  const daftarB = await daftar(b);
  cek("siswa yang sudah kumpul tetap diminta checkout", daftarB[0]?.sudah_kumpul === true);
  cek("checkout TIDAK diterima", (await checkout(b, false)).error === null);

  const milikB = await b.klien.from("checkout_ujian").select("siswa_id");
  cek(
    "siswa hanya bisa membaca checkout sendiri",
    milikB.data?.length === 1 && milikB.data[0].siswa_id === b.siswaId
  );

  bagian("3. Setelah jendela tutup");
  await ubahTutup(menitDariSekarang(-2));
  const terlambat = await checkout(c, true);
  cek(
    "checkout setelah tutup ditolak",
    terlambat.error?.message.includes("sudah habis") === true,
    terlambat.error?.message
  );
  cek("mapel tutup hilang dari daftar", (await daftar(c)).length === 0);

  bagian("4. Catatan di Pantau Ujian dan Rekap Nilai");
  const data = await muatCheckoutMapel(admin, mapel.id);
  const sekarang = Date.now();
  const status = (s: Akun, sudahMulai: boolean) =>
    checkoutSatuSiswa(data, s.siswaId, sudahMulai, sekarang);

  const sA = status(a, true);
  const sB = status(b, true);
  const sC = status(c, true);
  const sD = status(d, false);
  cek("siswa A: sudah checkout, tanpa catatan", sA.status === "sudah" && catatanCheckout(sA.status, sA.masihDiRuang) === "");
  cek(
    "siswa B: jawaban TIDAK diberi catatan",
    catatanCheckout(sB.status, sB.masihDiRuang).includes("TIDAK")
  );
  cek(
    "siswa C: dicatat Belum checkout",
    catatanCheckout(sC.status, sC.masihDiRuang) === "Belum checkout"
  );
  cek(
    "siswa D (tidak ikut): tanpa catatan",
    sD.status === "tidak_ikut" && catatanCheckout(sD.status, sD.masihDiRuang) === ""
  );

  const nilaiC = pastikan(
    await admin
      .from("nilai")
      .select("siswa_id")
      .eq("siswa_id", c.siswaId)
      .eq("mapel_id", mapel.id),
    "baca nilai"
  ) as unknown[];
  cek("siswa C tetap punya nilai walau tidak checkout", nilaiC.length === 1);

  bagian("5. Reset dan mapel lama");
  pastikan(
    await admin.rpc("reset_ujian_siswa", {
      p_siswa_id: a.siswaId,
      p_mapel_id: mapel.id,
    }),
    "reset siswa A"
  );
  cek("reset ikut menghapus checkout", (await barisCheckout(a)).length === 0);

  await ubahTutup(menitDariSekarang(3));
  pastikan(
    await admin.from("mapel").update({ checkout_wajib: false }).eq("id", mapel.id),
    "tandai mapel lama"
  );
  await mulai(a);
  const mapelLama = await checkout(a, true);
  cek(
    "mapel lama: checkout tidak berlaku",
    mapelLama.error?.message.includes("tidak memakai") === true,
    mapelLama.error?.message
  );
  cek(
    "mapel lama: tanpa catatan",
    (await muatCheckoutMapel(admin, mapel.id)) === null
  );
}

async function utama() {
  if (![7, 8, 9].includes(kelas)) {
    console.log("Pilih project: --kelas 7, --kelas 8, atau --kelas 9");
    process.exitCode = 1;
    return;
  }

  const jalankan = argumen.includes("--jalankan");
  const hanyaBersihkan = argumen.includes("--bersihkan");

  if (!jalankan && !hanyaBersihkan) {
    console.log(`RENCANA (belum ada yang dijalankan) untuk database kelas ${kelas}:
  - buat kelas, kegiatan, mapel, dan 4 akun siswa berawalan ${AWALAN}
  - uji aturan checkout sebagai siswa sungguhan
  - hapus semua data bot

Tambahkan --jalankan untuk mulai. Jangan jalankan saat ada ujian berlangsung.`);
    return;
  }

  const url = wajibEnv(`NEXT_PUBLIC_SUPABASE_URL_${kelas}`);
  const anonKey = wajibEnv(`NEXT_PUBLIC_SUPABASE_ANON_KEY_${kelas}`);
  const serviceKey = wajibEnv(`SUPABASE_SERVICE_ROLE_KEY_${kelas}`);
  const admin = createClient(url, serviceKey, OPSI_KLIEN);

  if (hanyaBersihkan) {
    await bersihkan(admin);
    return;
  }

  // Ctrl+C di tengah jalan tidak boleh meninggalkan data bot.
  process.once("SIGINT", () => {
    void bersihkan(admin).finally(() => process.exit(130));
  });

  console.log(`Bot uji checkout, database kelas ${kelas}`);
  try {
    await jalankanUji(admin, url, anonKey);
  } catch (e) {
    gagal++;
    console.log(`\n  BERHENTI  ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await bersihkan(admin);
  }

  console.log(`\nHasil: ${lulus} lulus, ${gagal} gagal.`);
  process.exitCode = gagal > 0 ? 1 : 0;
}

void utama();
