import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FormChatForum, { type PesanForumSiswa } from "./FormChatForum";

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

  const { data: pesanList } = await supabase
    .from("forum_pesan")
    .select("id, siswa_id, guru_id, isi, jenis_isi, created_at, siswa(nama), guru(nama)")
    .eq("forum_topik_id", topik.id)
    .eq("kelas_id", siswa.kelas_id)
    .order("created_at", { ascending: true });

  const pesan: PesanForumSiswa[] = (pesanList ?? []).map((p) => {
    const siswaNama = (p.siswa as unknown as { nama: string } | null)?.nama;
    const guruNama = (p.guru as unknown as { nama: string } | null)?.nama;
    return {
      id: p.id as string,
      isi: p.isi as string,
      jenisIsi: p.jenis_isi as "teks" | "sticker" | "emoticon",
      createdAt: p.created_at as string,
      punyaSendiri: p.siswa_id === siswa.id,
      dari:
        p.guru_id !== null
          ? { tipe: "guru" as const, nama: guruNama ?? "Guru" }
          : { tipe: "siswa" as const, nama: siswaNama ?? "Siswa" },
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
