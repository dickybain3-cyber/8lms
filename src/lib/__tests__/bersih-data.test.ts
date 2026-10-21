/**
 * Jalankan: npx tsx src/lib/__tests__/bersih-data.test.ts
 *
 * Supabase tiruan di memori — cukup untuk select/in/not/delete/count dan
 * storage.remove. Yang dijaga: mode "data_siswa" TIDAK PERNAH menyentuh
 * event/mapel/soal/tugas/forum_topik, dan berkas Storage dihapus.
 */
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bersihkanKegiatan, ringkasDataKegiatan } from "@/lib/bersih-data";

type Baris = Record<string, unknown>;

function buatDb(awal: Record<string, Baris[]>) {
  const tabel: Record<string, Baris[]> = JSON.parse(JSON.stringify(awal));
  const terhapusStorage: string[] = [];

  function query(nama: string) {
    const filter: ((r: Baris) => boolean)[] = [];
    let mode: "select" | "delete" = "select";
    let head = false;
    let order: string | null = null;
    const q = {
      select(_k: string, o?: { count?: string; head?: boolean }) {
        head = !!o?.head;
        return q;
      },
      delete() {
        mode = "delete";
        return q;
      },
      in(k: string, v: unknown[]) {
        filter.push((r) => v.includes(r[k]));
        return q;
      },
      eq(k: string, v: unknown) {
        filter.push((r) => r[k] === v);
        return q;
      },
      not(k: string, _op: string, _v: null) {
        filter.push((r) => r[k] !== null && r[k] !== undefined);
        return q;
      },
      order(k: string) {
        order = k;
        return q;
      },
      then(ok: (x: unknown) => void) {
        const isi = tabel[nama];
        if (!isi) return ok({ data: null, count: null, error: { message: "tabel tidak ada" } });
        const cocok = isi.filter((r) => filter.every((f) => f(r)));
        if (mode === "delete") {
          tabel[nama] = isi.filter((r) => !cocok.includes(r));
          // cascade sederhana untuk uji mode total
          if (nama === "event") {
            const ids = cocok.map((r) => r.id);
            tabel.mapel = (tabel.mapel ?? []).filter((m) => !ids.includes(m.event_id));
          }
          return ok({ data: null, count: cocok.length, error: null });
        }
        if (order) cocok.sort((a, b) => String(b[order!]).localeCompare(String(a[order!])));
        return ok({ data: head ? null : cocok, count: cocok.length, error: null });
      },
    };
    return q;
  }

  const db = {
    from: query,
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          terhapusStorage.push(...paths);
          return { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  return { db, tabel, terhapusStorage };
}

const awal = {
  event: [
    { id: "e1", nama: "PTS", jenis: "asesmen_akhir", tgl_mulai: "2026-09-01", tgl_selesai: "2026-09-05" },
    { id: "e2", nama: "Tugas", jenis: "assignment", tgl_mulai: "2026-09-01", tgl_selesai: "2026-09-30" },
  ],
  mapel: [{ id: "m1", event_id: "e1" }],
  soal: [{ id: "s1", mapel_id: "m1" }, { id: "s2", mapel_id: "m1" }],
  jawaban_siswa: [{ mapel_id: "m1", siswa_id: "a" }, { mapel_id: "m1", siswa_id: "b" }],
  nilai: [{ mapel_id: "m1", siswa_id: "a" }],
  tugas: [{ id: "t1", event_id: "e2" }],
  pengumpulan_tugas: [
    { tugas_id: "t1", siswa_id: "a", berkas_path: "t1/a/foto.jpg" },
    { tugas_id: "t1", siswa_id: "b", berkas_path: null },
  ],
  forum_topik: [] as Baris[],
  forum_pesan: [] as Baris[],
  forum_poin: [] as Baris[],
};

async function main() {
  let lulus = 0;
  const uji = async (nama: string, fn: () => Promise<void>) => {
    await fn();
    lulus++;
    console.log(`  ✓ ${nama}`);
  };

  await uji("ringkasan menghitung per kegiatan", async () => {
    const { db } = buatDb(awal);
    const r = await ringkasDataKegiatan(db);
    const pts = r.find((x) => x.id === "e1")!;
    assert.deepEqual([pts.mapel, pts.soal, pts.jawaban, pts.nilai], [1, 2, 2, 1]);
    const tg = r.find((x) => x.id === "e2")!;
    assert.deepEqual([tg.tugas, tg.pengumpulan, tg.berkas], [1, 2, 1]);
  });

  await uji("data_siswa: hasil siswa hilang, kegiatan & soal tetap", async () => {
    const { db, tabel, terhapusStorage } = buatDb(awal);
    const h = await bersihkanKegiatan(db, ["e1", "e2"], "data_siswa");
    assert.equal(tabel.jawaban_siswa.length, 0);
    assert.equal(tabel.nilai.length, 0);
    assert.equal(tabel.pengumpulan_tugas.length, 0);
    assert.equal(tabel.event.length, 2);
    assert.equal(tabel.soal.length, 2);
    assert.equal(tabel.tugas.length, 1);
    assert.deepEqual(terhapusStorage, ["t1/a/foto.jpg"]);
    assert.deepEqual([h.jawaban, h.nilai, h.pengumpulan, h.berkas], [2, 1, 2, 1]);
  });

  await uji("total: event dihapus, hanya kegiatan terpilih", async () => {
    const { db, tabel } = buatDb(awal);
    const h = await bersihkanKegiatan(db, ["e1"], "total");
    assert.equal(h.kegiatan, 1);
    assert.deepEqual(tabel.event.map((e) => e.id), ["e2"]);
    assert.equal(h.jawaban, 2);
  });

  await uji("tabel tugas/forum belum ada (migrasi belum jalan) tidak menggagalkan", async () => {
    const { db, tabel } = buatDb({ event: awal.event, mapel: awal.mapel, soal: awal.soal, jawaban_siswa: awal.jawaban_siswa, nilai: awal.nilai });
    await bersihkanKegiatan(db, ["e1"], "data_siswa");
    assert.equal(tabel.jawaban_siswa.length, 0);
  });

  console.log(`\n${lulus} uji lulus.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
