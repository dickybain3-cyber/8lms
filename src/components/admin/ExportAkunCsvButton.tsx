"use client";

/**
 * Tombol export CSV generik untuk daftar akun siswa/guru (Sesi 15).
 *
 * Sengaja TIDAK dibuat dengan menarik ulang `unduhCsv` dari
 * `NilaiTable.tsx` (Sesi 5) — komponen itu sudah berjalan dan tidak ada
 * akses lingkungan untuk menjalankan aplikasi + uji regresi sungguhan di
 * sesi ini (lihat catatan lingkungan README bagian "Sesi 15"), jadi
 * menyentuh file yang sudah bekerja demi deduplikasi berisiko tanpa ada
 * cara memverifikasi tidak ada yang rusak. Duplikasi kecil (escape CSV +
 * builder Blob) diterima di sini, bukan dianggap utang teknis mendesak.
 *
 * **Cakupan export**: HANYA baris yang sedang ditampilkan di halaman
 * (setelah filter pencarian/kelas & batas pagination 200 baris) — BUKAN
 * seluruh tabel `siswa`/`guru`. Konsisten dengan cara `/admin/siswa` &
 * `/admin/guru` sendiri menampilkan data (lihat komentar batas 200 baris
 * di kedua `page.tsx`) — kalau guru butuh export lebih dari 200 akun
 * sekaligus, mereka perlu export per halaman (klik "Muat lebih banyak"
 * dulu) atau ini jadi kandidat penghalusan berikutnya (fetch semua baris
 * khusus untuk export, terpisah dari batas tampilan).
 */
export default function ExportAkunCsvButton({
  headers,
  rows,
  filename,
}: {
  headers: string[];
  rows: string[][];
  filename: string;
}) {
  function handleClick() {
    const escape = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const lines = [
      headers.map(escape).join(","),
      ...rows.map((row) => row.map(escape).join(",")),
    ];

    // BOM (\uFEFF) supaya Excel di Windows membuka karakter non-ASCII
    // (mis. nama dengan huruf beraksen) dengan benar — pola sama dengan
    // `unduhCsv` di NilaiTable.tsx Sesi 5.
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (rows.length === 0) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink/30"
    >
      Export CSV ({rows.length} baris)
    </button>
  );
}
