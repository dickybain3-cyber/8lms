"use server";

/**
 * Server Action publik tryout (siswa TANPA login).
 *
 * Alur: cekToken -> (tiket bertanda tangan) -> daftarNama -> masuk
 * (cookie sesi) -> simpanJawaban / kumpulkan.
 *
 * Identitas siswa SELALU dibaca dari cookie sesi bertanda tangan
 * (`bacaSesiTryout`), tidak pernah dari argumen. Argumen dari browser
 * hanya id subtes dan jawaban, dan keduanya divalidasi lagi oleh RPC 0029.
 */
import { revalidatePath } from "next/cache";
import {
  bacaSesiTryout,
  bacaTiket,
  buatTiket,
  hapusSesiTryout,
  klienTryout,
  kunciKlien,
  pesanGalat,
  tulisSesiTryout,
  uuidValid,
} from "@/lib/tryout-server";
import { KELAS_TRYOUT, normalisasiToken } from "@/lib/tryout";

export type HasilCekToken =
  | { ok: true; tiket: string; paketNama: string }
  | { ok: false; error: string };

export async function cekToken(eventId: string, tokenMentah: string): Promise<HasilCekToken> {
  if (!uuidValid(eventId)) return { ok: false, error: "Link tryout tidak valid." };
  const token = normalisasiToken(String(tokenMentah ?? ""));
  if (token.length < 4 || token.length > 12) {
    return { ok: false, error: "Token terdiri dari 4–12 huruf/angka." };
  }

  const db = await klienTryout();
  const { data, error } = await db.rpc("tryout_cek_token", {
    p_event_id: eventId,
    p_token: token,
    p_kunci_klien: await kunciKlien(),
  });
  if (error) return { ok: false, error: "Server sedang sibuk. Coba lagi sebentar lagi." };

  const baris = (data as { status: string; paket_id: string | null; paket_nama: string | null }[])?.[0];
  switch (baris?.status) {
    case "ok":
      return {
        ok: true,
        tiket: buatTiket({ e: eventId, p: baris.paket_id as string, pn: baris.paket_nama ?? "" }),
        paketNama: baris.paket_nama ?? "",
      };
    case "belum_dibuka":
      return { ok: false, error: `Token benar, tetapi ${baris.paket_nama ?? "paket"} belum dibuka.` };
    case "sudah_ditutup":
      return { ok: false, error: `Token benar, tetapi ${baris.paket_nama ?? "paket"} sudah ditutup.` };
    case "diblokir":
      return { ok: false, error: "Terlalu banyak token salah. Tunggu 5 menit lalu coba lagi." };
    default:
      return { ok: false, error: "Token salah. Periksa lagi huruf dan angkanya." };
  }
}

export type HasilDaftarNama =
  | { ok: true; siswa: { id: string; nama: string }[] }
  | { ok: false; error: string };

export async function daftarNama(tiket: string, kelas: string): Promise<HasilDaftarNama> {
  const t = bacaTiket(tiket);
  if (!t) return { ok: false, error: "Waktu memilih nama habis. Masukkan token lagi." };
  if (!(KELAS_TRYOUT as readonly string[]).includes(kelas)) {
    return { ok: false, error: "Pilih kelas 9.1 – 9.6." };
  }
  const db = await klienTryout();
  const { data, error } = await db.rpc("tryout_daftar_siswa", { p_kelas_nama: kelas });
  if (error) return { ok: false, error: "Gagal memuat daftar nama. Coba lagi." };
  return { ok: true, siswa: (data ?? []) as { id: string; nama: string }[] };
}

export async function masuk(
  tiket: string,
  siswaId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = bacaTiket(tiket);
  if (!t) return { ok: false, error: "Waktu memilih nama habis. Masukkan token lagi." };
  if (!uuidValid(siswaId)) return { ok: false, error: "Pilih namamu dari daftar." };

  const db = await klienTryout();
  const { data: siswa } = await db
    .from("siswa")
    .select("id, nama, kelas(nama, tingkat)")
    .eq("id", siswaId)
    .maybeSingle();
  const kelas = (siswa?.kelas as unknown as { nama: string; tingkat: number } | null) ?? null;
  if (!siswa || kelas?.tingkat !== 9) return { ok: false, error: "Nama tidak ditemukan di kelas 9." };

  const { error } = await db.rpc("tryout_masuk_paket", {
    p_paket_id: t.p,
    p_siswa_id: siswaId,
    p_kunci_klien: await kunciKlien(),
  });
  if (error) return { ok: false, error: pesanGalat(error, "Gagal masuk. Coba lagi.") };

  await tulisSesiTryout({ e: t.e, p: t.p, s: siswa.id, n: siswa.nama, k: kelas.nama });
  revalidatePath(`/tryout/${t.e}`);
  return { ok: true };
}

export async function keluarSesi(): Promise<void> {
  await hapusSesiTryout();
}

export type HasilSimpan =
  | { ok: true; tersimpan: boolean }
  | { ok: false; error: string; sesiHabis?: boolean };

function jawabanAman(j: unknown): Record<string, unknown> | null {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  return j as Record<string, unknown>;
}

export async function simpanJawaban(
  mapelId: string,
  jawaban: Record<string, unknown>,
  progres: number,
  soalAktif: number | null
): Promise<HasilSimpan> {
  const sesi = await bacaSesiTryout();
  if (!sesi) return { ok: false, error: "Sesi tryout habis. Masukkan token lagi.", sesiHabis: true };
  const j = jawabanAman(jawaban);
  if (!uuidValid(mapelId) || !j) return { ok: false, error: "Data jawaban tidak valid." };

  const db = await klienTryout();
  const { data, error } = await db.rpc("tryout_simpan_jawaban", {
    p_paket_id: sesi.p,
    p_siswa_id: sesi.s,
    p_mapel_id: mapelId,
    p_jawaban: j,
    p_progress: Math.max(0, Math.min(100, Math.round(Number(progres) || 0))),
    p_soal_aktif: soalAktif === null ? null : Math.max(1, Math.round(Number(soalAktif) || 1)),
  });
  if (error) return { ok: false, error: pesanGalat(error, "Gagal menyimpan ke server. Jawaban tetap tersimpan di HP.") };
  return { ok: true, tersimpan: data === true };
}

export async function kumpulkan(
  mapelId: string,
  jawaban: Record<string, unknown> | null
): Promise<{ ok: true } | { ok: false; error: string; sesiHabis?: boolean }> {
  const sesi = await bacaSesiTryout();
  if (!sesi) return { ok: false, error: "Sesi tryout habis. Masukkan token lagi.", sesiHabis: true };
  if (!uuidValid(mapelId)) return { ok: false, error: "Subtes tidak valid." };

  const db = await klienTryout();
  const { error } = await db.rpc("tryout_kumpulkan", {
    p_paket_id: sesi.p,
    p_siswa_id: sesi.s,
    p_mapel_id: mapelId,
    p_jawaban: jawabanAman(jawaban),
  });
  if (error) return { ok: false, error: pesanGalat(error, "Gagal mengumpulkan. Coba lagi.") };
  revalidatePath(`/tryout/${sesi.e}`);
  return { ok: true };
}
