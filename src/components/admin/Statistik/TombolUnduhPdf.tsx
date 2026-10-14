"use client";

/**
 * "Unduh PDF" lewat dialog cetak browser (pilih "Simpan sebagai PDF").
 * Tanpa pustaka PDF di sisi browser (jsPDF + html2canvas ±300 KB) — HP murah
 * tetap ringan, dan hasilnya teks asli yang tajam, bukan gambar tangkapan
 * layar. Tata letak cetak diatur di globals.css (@media print).
 */
export default function TombolUnduhPdf({ namaBerkas }: { namaBerkas: string }) {
  function cetak() {
    const judulLama = document.title;
    // Judul dokumen dipakai browser sebagai nama berkas PDF.
    document.title = namaBerkas;
    window.print();
    setTimeout(() => {
      document.title = judulLama;
    }, 1000);
  }
  return (
    <button
      type="button"
      onClick={cetak}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[--primary] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[--primary-hover] print:hidden"
    >
      <i className="fas fa-file-pdf" aria-hidden />
      Unduh PDF
    </button>
  );
}
