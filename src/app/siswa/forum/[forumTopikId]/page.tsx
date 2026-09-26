import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormChatForum, { type PesanForumSiswa } from "./FormChatForum";
import type { PesanKutipan } from "@/components/forum/KutipanBalas";
import { kelompokkanReaksi, type BarisReaksi } from "@/components/forum/ReaksiPesan";

/**
 * Halaman forum untuk siswa. Pola sama persis dengan
 * `siswa/tugas/[tugasId]/page.tsx` (Tahap 4): tidak ada cek "apakah
 * kelas ini termasuk kelas target" secara manual — RLS
 * (`forum_topik_select_siswa`, `forum_pesan_select_siswa`) sudah
 * menegakkannya. Kalau siswa mengetik URL forum kelas lain, query di
 * bawah ini cuma akan pulang kosong, bukan menampilkan data yang bukan
 * haknya.
 */
export default async function ForumSiswaPage({
  params,
}: {
  params: { forumTopikId: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: siswa } = await supabase
    .from("siswa")
    .select("id, kelas_id, nama")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!siswa) {
    notFound();
  }

  const { data: topik } = await supabase
    .from("forum_topik")
    .select("id, dibuka_at, ditutup_at, event(nama)")
    .eq("id", params.forumTopikId)
    .maybeSingle();

  // RLS yang menentukan ini `null` atau tidak — bukan pengecekan manual
  // di sini. Kalau kosong, siswa ini memang tidak berhak melihat forum
  // ini (bukan kelasnya) ATAU forum ini tidak ada sama sekali; keduanya
  // sama-sama pantas 404.
  if (!topik) {
    notFound();
  }

  const eventNama =
    (topik.event as unknown as { nama: string } | null)?.nama ?? "Forum";

  // `gambar_url`, `balas_ke_id`, dan `forum_reaksi` datang dari migrasi
  // 0021 — kalau belum dijalankan di project jenjang ini, SELECT ini akan
  // gagal dengan "column does not exist" untuk SELURUH halaman forum,
  // bukan cuma fitur foto/balasan/reaksinya saja. Beda dengan Part 4
  // (Server Action insert), kolom baru di sini tidak bisa "diam-diam
  // dilewati" kalau kosong — jadi 0021 WAJIB sudah jalan sebelum halaman
  // ini dipakai.
  const { data: pesanList } = await supabase
    .from("forum_pesan")
    .select(
      "id, siswa_id, guru_id, isi, jenis_isi, gambar_url, balas_ke_id, created_at, siswa(nama), guru(nama), forum_reaksi(guru_id, emoji)"
    )
    .eq("forum_topik_id", topik.id)
    .eq("kelas_id", siswa.kelas_id)
    .order("created_at", { ascending: true });

  const baris = pesanList ?? [];

  // Kutipan pesan yang dibalas diambil dari DAFTAR YANG SAMA (bukan
  // self-join Supabase): `balas_ke_id` cuma boleh menunjuk pesan di
  // forum_topik + kelas yang sama (ditegakkan di Server Action saat
  // insert, lihat forum.ts), jadi pesan aslinya sudah pasti ada di sini.
  const petaPesan = new Map<string, PesanKutipan>();
  for (const p of baris) {
    const siswaNama = (p.siswa as unknown as { nama: string } | null)?.nama;
    const guruNama = (p.guru as unknown as { nama: string } | null)?.nama;
    petaPesan.set(p.id as string, {
      id: p.id as string,
      pengirim: p.guru_id !== null ? (guruNama ?? "Guru") : (siswaNama ?? "Siswa"),
      jenis_isi: p.jenis_isi as PesanKutipan["jenis_isi"],
      isi: p.isi as string,
    });
  }

  const pesan: PesanForumSiswa[] = baris.map((p) => {
    const siswaNama = (p.siswa as unknown as { nama: string } | null)?.nama;
    const guruNama = (p.guru as unknown as { nama: string } | null)?.nama;
    const balasKeId = p.balas_ke_id as string | null;
    return {
      id: p.id as string,
      isi: p.isi as string,
      jenisIsi: p.jenis_isi as PesanForumSiswa["jenisIsi"],
      gambarUrl: (p.gambar_url as string | null) ?? null,
      createdAt: p.created_at as string,
      punyaSendiri: p.siswa_id === siswa.id,
      dari:
        p.guru_id !== null
          ? { tipe: "guru" as const, nama: guruNama ?? "Guru" }
          : { tipe: "siswa" as const, nama: siswaNama ?? "Siswa" },
      // `null` di sini bisa berarti dua hal: pesan ini bukan balasan, atau
      // pesan aslinya sudah tidak ada di petaPesan (kolomnya di-set NULL
      // oleh `on delete set null` kalau pesan asli terhapus, 0021).
      // `KutipanDiBubble` menampilkan "Pesan asli tidak tersedia" untuk
      // dua-duanya kalau kamu memberi objek non-null tapi datanya kosong;
      // di sini kita cukup teruskan `null` apa adanya.
      balasKe: balasKeId ? (petaPesan.get(balasKeId) ?? null) : null,
      // Siswa cuma BACA reaksi (tidak bisa memberi, lihat RLS 0021), jadi
      // `guruIdSaya` selalu null di sini — tidak ada baris yang perlu
      // ditandai "olehSaya".
      reaksi: kelompokkanReaksi((p.forum_reaksi ?? []) as BarisReaksi[], null),
    };
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link href="/siswa" className="text-sm text-ink/50 hover:text-ink">
          ← Dashboard
        </Link>
      </div>

      <h1 className="mb-1 font-serif text-xl font-bold text-ink">
        {eventNama}
      </h1>
      <p className="mb-5 text-sm text-ink/50">Forum diskusi kelasmu</p>

      <FormChatForum
        forumTopikId={topik.id as string}
        kelasId={siswa.kelas_id as string}
        dibukaAt={topik.dibuka_at as string}
        ditutupAt={topik.ditutup_at as string}
        pesanAwal={pesan}
        namaSiswa={siswa.nama as string}
      />
    </div>
  );
}
