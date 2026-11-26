/**
 * Tanda tangan HMAC untuk sesi tryout tanpa login (cookie) dan "tiket"
 * sesudah token benar. Murni node:crypto — tanpa next/headers — supaya
 * bisa diuji langsung.
 *
 * Bentuk: base64url(JSON) + "." + base64url(HMAC-SHA256). Isi terbaca
 * siapa saja (tidak rahasia: id paket & id siswa), tapi tidak bisa diubah
 * tanpa kunci. Kedaluwarsa (`exp`, epoch detik) diperiksa saat dibaca.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function dariB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hitungTanda(isi: string, kunci: string): string {
  return b64url(createHmac("sha256", kunci).update(isi).digest());
}

export function buatTanda<T extends object>(
  data: T,
  kunci: string,
  masaDetik: number,
  sekarangMs = Date.now()
): string {
  const exp = Math.floor(sekarangMs / 1000) + masaDetik;
  const isi = b64url(Buffer.from(JSON.stringify({ ...data, exp }), "utf8"));
  return `${isi}.${hitungTanda(isi, kunci)}`;
}

export function bacaTanda<T extends object>(
  token: string | undefined | null,
  kunci: string,
  sekarangMs = Date.now()
): (T & { exp: number }) | null {
  if (!token || typeof token !== "string") return null;
  const bagian = token.split(".");
  if (bagian.length !== 2) return null;
  const [isi, tanda] = bagian;
  const harus = Buffer.from(hitungTanda(isi, kunci));
  const dapat = Buffer.from(tanda);
  if (harus.length !== dapat.length || !timingSafeEqual(harus, dapat)) return null;
  try {
    const data = JSON.parse(dariB64url(isi).toString("utf8")) as T & { exp: number };
    if (typeof data.exp !== "number" || data.exp * 1000 < sekarangMs) return null;
    return data;
  } catch {
    return null;
  }
}

/** Kunci turunan per tujuan, supaya tiket tidak bisa dipakai sebagai sesi. */
export function kunciTurunan(rahasiaInduk: string, tujuan: "sesi" | "tiket" | "klien"): string {
  return createHmac("sha256", rahasiaInduk).update(`lms-tryout:${tujuan}`).digest("hex");
}
