import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { faseForum } from "@/lib/forum";
import { formatTenggat } from "@/lib/tugas";
import PanelForumKelas, {
  type BarisPoin,
  type PesanForum,
} from "./PanelForumKelas";
import { Info, KepalaHalaman, Remah, TOMBOL_BIASA } from "@/components/ui/Panel";

/**
 * Ruang obrolan SATU kelas di dalam sebuah forum.
 *
 * ── KENAPA TABEL POIN DIBANGUN DARI DAFTAR SISWA, BUKAN DARI forum_poin ──
 *
 * Sama persis alasannya dengan halaman detail tugas (Tahap 4): siswa yang
 * belum pernah mengirim pesan bertipe teks TIDAK punya baris `forum_poin`
 * sama sekali (lihat komentar tabel itu di 0020_forum.sql). Kalau
 * kolom kanan di halaman ini merender hasil `SELECT * FROM forum_poin`
 * apa adanya, anak yang paling diam — justru yang paling perlu terlihat
 * guru — akan hilang begitu saja dari papan poin. Jadi urutannya dibalik:
 * ambil daftar siswa kelas ini lebih dulu, lalu TEMPELKAN angka dari
 * `forum_poin` kalau ada, sisanya 0.
 */
export default async function ForumRuangKelasPage({
  params,
}: {
  params: { eventId: string; kelasId: string };
}) {
  const supabase = createClient();

  const { data: event } = await supabase
    .from("event")
    .select("id, nama")
    .eq("id", params.eventId)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const { data: topik } = await supabase
    .from("forum_topik")
    .select("id, dibuka_at, ditutup_at")
    .eq("event_id", params.eventId)
    .maybeSingle();

  if (!topik) {
    notFound();
  }

  // Kelas ini harus BENAR-BENAR ditautkan ke forum_topik ini lewat
  // forum_kelas — bukan cuma "kelas ini ada di jenjang yang sama". Kalau
  // tidak, URL bisa diketik manual untuk membuka ruang kelas yang
  // sebenarnya tidak ikut forum ini.
  const { data: kelasTarget } = await supabase
    .from("forum_kelas")
    .select("kelas_id, kelas(nama)")
    .eq("forum_topik_id", topik.id)
    .eq("kelas_id", params.kelasId)
    .maybeSingle();

  if (!kelasTarget) {
    notFound();
  }

  const kelasNama =
    (kelasTarget.kelas as unknown as { nama: string } | null)?.nama ??
    "Kelas";

  const [{ data: siswaList }, { data: pesanList }, { data: poinList }] =
    await Promise.all([
      supabase
        .from("siswa")
        .select("id, nama, username")
        .eq("kelas_id", params.kelasId)
        .order("nama"),
      supabase
        .from("forum_pesan")
        .select(
          "id, siswa_id, guru_id, isi, jenis_isi, bonus_diberikan, created_at, siswa(nama), guru(nama)"
        )
        .eq("forum_topik_id", topik.id)
        .eq("kelas_id", params.kelasId)
        .order("created_at", { ascending: true }),
      supabase
        .from("forum_poin")
        .select("siswa_id, poin_pesan, poin_bonus, total")
        .eq("forum_topik_id", topik.id)
        .eq("kelas_id", params.kelasId),
    ]);

  const pesan: PesanForum[] = (pesanList ?? []).map((p) => {
    const siswaNama = (p.siswa as unknown as { nama: string } | null)?.nama;
    const guruNama = (p.guru as unknown as { nama: string } | null)?.nama;
    return {
      id: p.id as string,
      isi: p.isi as string,
      jenisIsi: p.jenis_isi as "teks" | "sticker" | "emoticon",
      createdAt: p.created_at as string,
      bonusDiberikan: Boolean(p.bonus_diberikan),
      dari:
        p.guru_id !== null
          ? { tipe: "guru" as const, nama: guruNama ?? "Guru" }
          : { tipe: "siswa" as const, nama: siswaNama ?? "Siswa" },
      siswaId: (p.siswa_id as string | null) ?? null,
    };
  });

  const petaPoin = new Map<
    string,
    { poin_pesan: number; poin_bonus: number; total: number }
  >();
  for (const p of poinList ?? []) {
    petaPoin.set(p.siswa_id as string, {
      poin_pesan: Number(p.poin_pesan),
      poin_bonus: Number(p.poin_bonus),
      total: Number(p.total),
    });
  }

  // Siswa DULU, poin ditempel BELAKANGAN — lihat penjelasan di kepala
  // berkas ini. Diurutkan dari total tertinggi supaya guru langsung
  // melihat siapa yang paling aktif tanpa perlu mengurutkan manual.
  const barisPoin: BarisPoin[] = (siswaList ?? [])
    .map((s) => {
      const p = petaPoin.get(s.id as string);
      return {
        siswaId: s.id as string,
        nama: s.nama as string,
        username: s.username as string,
        poinPesan: p?.poin_pesan ?? 0,
        poinBonus: p?.poin_bonus ?? 0,
        total: p?.total ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));

  const fase = faseForum(
    { dibuka_at: topik.dibuka_at as string, ditutup_at: topik.ditutup_at as string },
    Date.now()
  );

  return (
    <div>
      <Remah href={`/admin/event/${params.eventId}`} label={event.nama} />

      <KepalaHalaman
        judul={`Forum · ${kelasNama}`}
        ikon="fa-comments"
        keterangan={
          <>
            <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              <i className="fas fa-hourglass-end" aria-hidden />
              {fase === "belum_buka"
                ? `Dibuka ${formatTenggat(topik.dibuka_at as string)}`
                : fase === "berlangsung"
                  ? `Ditutup ${formatTenggat(topik.ditutup_at as string)}`
                  : `Ditutup sejak ${formatTenggat(topik.ditutup_at as string)}`}
            </span>
            {barisPoin.length} siswa di ruang ini
          </>
        }
        aksi={
          <Link
            href={`/admin/event/${params.eventId}/forum/edit`}
            className={TOMBOL_BIASA}
          >
            <i className="fas fa-gear" aria-hidden />
            Pengaturan Forum
          </Link>
        }
      />

      {fase === "belum_buka" && (
        <Info nada="info">
          Forum ini belum dibuka untuk siswa ({formatTenggat(topik.dibuka_at as string)}
          ). Kamu tetap bisa mengirim pesan sekarang untuk menyiapkan
          pertanyaan pembuka — siswa baru bisa membaca &amp; membalas
          begitu jamnya tiba.
        </Info>
      )}

      {fase === "ditutup" && (
        <Info nada="info">
          Forum ini sudah ditutup — siswa tidak bisa mengirim pesan baru
          lagi, tapi kamu masih bisa membaca riwayatnya dan memberi bonus
          poin untuk pesan yang sudah masuk.
        </Info>
      )}

      <PanelForumKelas
        eventId={params.eventId}
        forumTopikId={topik.id as string}
        kelasId={params.kelasId}
        pesanAwal={pesan}
        poinAwal={barisPoin}
      />
    </div>
  );
}
