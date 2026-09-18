import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminHomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1 className="mb-2 font-serif text-2xl text-ink">Dashboard Admin</h1>
      <p className="mb-6 text-sm text-ink/60">
        Login sebagai: {user?.email ?? "—"}
      </p>
      <Link
        href="/admin/event"
        className="inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink-light"
      >
        Kelola Event & Mapel →
      </Link>
      <p className="mt-4 text-sm text-ink/40">
        Statistik dan Pengolahan Nilai dibangun di sesi berikutnya.
      </p>
    </div>
  );
}
