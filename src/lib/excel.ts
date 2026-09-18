/**
 * Pembuat file .xlsx di sisi browser.
 *
 * KENAPA EXCELJS, BUKAN CSV SEPERTI SEBELUMNYA
 * CSV yang sudah ada (ExportAkunCsvButton) tetap dipertahankan — formatnya
 * paling aman untuk diimpor ulang ke sistem lain. Tapi yang diminta guru
 * adalah file yang langsung rapi saat dibuka: ada judul, header tebal,
 * lebar kolom yang pas, dan satu sheet per kelas. CSV tidak bisa membawa
 * satu pun dari itu. Sistem lama memakai ExcelJS untuk alasan yang sama
 * (lihat downloadExcelSiswa/pnUnduhHasil di admin_baru.html), jadi memakai
 * pustaka yang sama menjaga hasil unduhan tetap familier bagi guru.
 *
 * KENAPA DYNAMIC IMPORT
 * ExcelJS besar (±1 MB). Diimpor statis, dia ikut terbundel ke halaman
 * admin dan memperlambat muat halaman untuk semua orang, padahal tombol
 * unduhnya mungkin tidak pernah diklik. `await import()` membuat pustaka
 * itu baru diunduh browser pada klik pertama.
 *
 * KENAPA DI BROWSER, BUKAN DI SERVER
 * Data yang diekspor sudah ada di layar (atau baru saja ditarik lewat
 * server action). Merakit file di browser menghindari mengirim file
 * megabyte-an bolak-balik lewat jaringan, dan menghindari beban CPU di
 * server saat beberapa guru mengunduh rekap bersamaan di akhir ujian —
 * saat itulah server justru sedang paling sibuk melayani submit siswa.
 *
 * PRASYARAT: jalankan `npm install exceljs` (lihat PETUNJUK-REVISI.md).
 */

export interface KolomExcel {
  header: string;
  /** Kunci properti pada objek baris. */
  key: string;
  /** Lebar kolom (satuan karakter ExcelJS). Default 18. */
  lebar?: number;
  /** Rata tengah untuk kolom angka/status. Default: kiri. */
  tengah?: boolean;
}

export interface SheetExcel {
  /** Nama tab. Otomatis dibersihkan dari karakter terlarang & dipotong 31 huruf. */
  nama: string;
  judul?: string;
  subjudul?: string;
  kolom: KolomExcel[];
  baris: Record<string, string | number | boolean | null | undefined>[];
  /**
   * Penanda baris yang perlu disorot kuning — dipakai untuk siswa yang belum
   * mengerjakan, meniru kebiasaan rekap di sistem lama sehingga guru bisa
   * langsung melihat siapa yang perlu ujian susulan tanpa menyaring manual.
   */
  sorotBaris?: (baris: Record<string, unknown>) => boolean;
}

/** Nama tab Excel tidak boleh memuat : \ / ? * [ ] dan maksimal 31 karakter. */
function namaSheetAman(nama: string): string {
  return nama.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Sheet";
}

export async function unduhExcel(
  namaFile: string,
  sheets: SheetExcel[]
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "LMS CBT";
  wb.created = new Date();

  for (const def of sheets) {
    const ws = wb.addWorksheet(namaSheetAman(def.nama));
    const jumlahKolom = def.kolom.length;

    ws.columns = def.kolom.map((k) => ({ width: k.lebar ?? 18 }));

    let barisKe = 1;

    if (def.judul) {
      ws.mergeCells(1, 1, 1, jumlahKolom);
      const sel = ws.getCell(1, 1);
      sel.value = def.judul;
      sel.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
      sel.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      };
      sel.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 24;
      barisKe++;
    }

    if (def.subjudul) {
      ws.mergeCells(barisKe, 1, barisKe, jumlahKolom);
      const sel = ws.getCell(barisKe, 1);
      sel.value = def.subjudul;
      sel.font = { italic: true, size: 9, color: { argb: "FF475569" } };
      sel.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF8FAFC" },
      };
      sel.alignment = { horizontal: "center" };
      barisKe++;
    }

    if (def.judul || def.subjudul) barisKe++; // satu baris kosong pemisah

    const header = ws.getRow(barisKe);
    header.values = def.kolom.map((k) => k.header);
    header.eachCell((sel) => {
      sel.font = { bold: true, color: { argb: "FFFFFFFF" } };
      sel.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3B82F6" },
      };
      sel.alignment = { horizontal: "center", vertical: "middle" };
      sel.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    header.height = 22;
    const barisHeader = barisKe;
    barisKe++;

    def.baris.forEach((data, i) => {
      const row = ws.getRow(barisKe + i);
      row.values = def.kolom.map((k) => {
        const v = data[k.key];
        return v === null || v === undefined ? "" : v;
      });

      const disorot = def.sorotBaris?.(data) ?? false;

      row.eachCell({ includeEmpty: true }, (sel, kolomKe) => {
        sel.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        if (def.kolom[kolomKe - 1]?.tengah) {
          sel.alignment = { horizontal: "center", vertical: "middle" };
        }
        if (disorot) {
          sel.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEF9C3" },
          };
        } else if (i % 2 === 1) {
          sel.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
      });
    });

    // Baris header dibekukan supaya tetap terlihat saat guru menggulir daftar
    // panjang — rekap satu jenjang bisa ratusan baris.
    ws.views = [{ state: "frozen", ySplit: barisHeader }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = namaFile.endsWith(".xlsx") ? namaFile : `${namaFile}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Format tanggal-waktu ringkas untuk isi sel Excel (bukan objek Date, supaya tidak tergantung locale mesin guru). */
export function waktuExcel(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ===========================================================================
// REKAP NILAI — kop bersurat 4 baris, satu sheet per kelas
// ===========================================================================
//
// Ditulis TERPISAH dari `unduhExcel()` di atas, bukan memakainya lewat
// parameter tambahan. `unduhExcel()` hanya menyediakan satu baris judul dan
// satu baris subjudul — cukup untuk ekspor daftar akun siswa/guru, tapi
// rekap nilai yang diminta guru butuh EMPAT baris kop dengan gaya berbeda
// tiap barisnya (nama mapel besar-tebal, nama kegiatan+kelas sedang, nama
// sekolah, tahun ajaran). Memaksakan bentuk itu lewat `judul`/`subjudul`
// yang sudah ada akan membuat parameter generiknya bercabang-cabang hanya
// untuk satu pemanggil — lebih jernih sebagai fungsi sendiri yang tahu
// persis bentuk laporan yang dia buat.
//
// Satu SHEET PER KELAS (bukan satu sheet berisi semua kelas dicampur)
// meniru pola yang sudah dipakai `ExportExcel.tsx` untuk daftar akun siswa,
// dan cocok dengan cara rekap nilai biasanya dicetak di sekolah: satu
// lembar per kelas, siap ditandatangani wali kelasnya masing-masing.

export interface BarisRekapNilai {
  nama: string;
  /** true = siswa ini sudah submit ujian (baris bisa dinilai). Siswa yang
   *  belum submit tetap ikut tercantum — supaya rekap juga berfungsi
   *  sebagai daftar "siapa yang belum mengerjakan", bukan cuma daftar
   *  siswa yang sudah selesai. */
  submitted: boolean;
  totalSkor: number | null;
  isOverride: boolean;
  jumlahBenar: number;
  jumlahSalah: number;
}

export interface KelasRekapNilai {
  kelasNama: string;
  siswa: BarisRekapNilai[];
}

function fmtSkorExcel(n: number | null): string | number {
  if (n === null) return "";
  return Number.isInteger(n) ? n : Math.round(n * 100) / 100;
}

/**
 * Satu baris teks di kop, digabung selebar tabel (5 kolom: No, Nama Siswa,
 * Nilai, Jumlah Benar, Jumlah Salah), dengan gaya yang dioper pemanggil
 * supaya baris pertama (nama mapel) bisa lebih besar & tebal daripada
 * baris ketiga (nama sekolah).
 */
function tulisBarisKop(
  ws: import("exceljs").Worksheet,
  baris: number,
  teks: string,
  gaya: Partial<import("exceljs").Font>
): void {
  ws.mergeCells(baris, 1, baris, 5);
  const sel = ws.getCell(baris, 1);
  sel.value = teks;
  sel.font = { name: "Calibri", ...gaya };
  sel.alignment = { horizontal: "center", vertical: "middle" };
}

export async function unduhExcelRekapNilai(opts: {
  mapelNama: string;
  /** Nama kegiatan, mis. "PAS Ganjil". Digabung dengan nama kelas di
   *  baris kedua kop tiap sheet: "PAS Ganjil (7.1)". */
  eventNama: string;
  tahunAjaran: string;
  perKelas: KelasRekapNilai[];
}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "LMS CBT";
  wb.created = new Date();

  for (const kelas of opts.perKelas) {
    // Nama tab Excel: tidak boleh memuat : \ / ? * [ ], maksimal 31
    // karakter, dan tidak boleh sama antar sheet dalam satu workbook —
    // nama kelas ("7.1", "8.3", dst) sudah pendek dan unik dengan
    // sendirinya, jadi dipakai apa adanya.
    const ws = wb.addWorksheet(namaSheetAman(kelas.kelasNama));

    ws.columns = [
      { width: 6 }, // No
      { width: 32 }, // Nama Siswa
      { width: 12 }, // Nilai
      { width: 15 }, // Jumlah Benar
      { width: 15 }, // Jumlah Salah
    ];

    // ── Kop 4 baris ──
    tulisBarisKop(ws, 1, `Nilai ${opts.mapelNama}`, {
      bold: true,
      size: 15,
      color: { argb: "FF1E293B" },
    });
    tulisBarisKop(
      ws,
      2,
      `${opts.eventNama} (${kelas.kelasNama})`,
      { bold: true, size: 12, color: { argb: "FF334155" } }
    );
    tulisBarisKop(ws, 3, "SMP Negeri 8 Probolinggo", {
      size: 11,
      color: { argb: "FF475569" },
    });
    tulisBarisKop(ws, 4, `Tahun Ajaran ${opts.tahunAjaran}`, {
      italic: true,
      size: 10,
      color: { argb: "FF64748B" },
    });
    ws.getRow(1).height = 22;
    for (let r = 2; r <= 4; r++) ws.getRow(r).height = 18;

    // Baris 5 dibiarkan kosong sebagai pemisah kop dari tabel.
    const barisHeader = 6;
    const header = ws.getRow(barisHeader);
    header.values = ["No", "Nama Siswa", "Nilai", "Jumlah Benar", "Jumlah Salah"];
    header.eachCell((sel) => {
      sel.font = { bold: true, color: { argb: "FFFFFFFF" } };
      sel.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3B82F6" },
      };
      sel.alignment = { horizontal: "center", vertical: "middle" };
      sel.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    header.height = 22;

    let adaOverride = false;

    kelas.siswa.forEach((s, i) => {
      const baris = barisHeader + 1 + i;
      const row = ws.getRow(baris);

      // Siswa yang belum submit: kolom Nilai/Benar/Salah dikosongkan
      // (bukan diisi 0) — 0 berarti "sudah dikerjakan, nilainya nol",
      // padahal yang terjadi adalah dia belum mengerjakan sama sekali.
      // Menyamakan keduanya membuat guru tidak bisa membedakan siswa
      // yang gagal total dari siswa yang absen ujian.
      row.values = [
        i + 1,
        s.nama,
        s.submitted ? fmtSkorExcel(s.totalSkor) + (s.isOverride ? " *" : "") : "Belum submit",
        s.submitted ? s.jumlahBenar : "",
        s.submitted ? s.jumlahSalah : "",
      ];

      if (s.isOverride) adaOverride = true;

      row.eachCell({ includeEmpty: true }, (sel, kolomKe) => {
        sel.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        if (kolomKe >= 3) {
          sel.alignment = { horizontal: "center", vertical: "middle" };
        }
        if (!s.submitted) {
          sel.font = { color: { argb: "FF94A3B8" }, italic: true };
        }
        if (i % 2 === 1) {
          sel.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
      });
    });

    let barisSetelahTabel = barisHeader + kelas.siswa.length + 1;

    if (adaOverride) {
      ws.mergeCells(barisSetelahTabel, 1, barisSetelahTabel, 5);
      const sel = ws.getCell(barisSetelahTabel, 1);
      sel.value = "* Nilai disesuaikan manual oleh guru (override).";
      sel.font = { italic: true, size: 9, color: { argb: "FF94A3B8" } };
      barisSetelahTabel++;
    }

    // Header tabel (baris 6) dibekukan, bukan kop — supaya kop tidak
    // menghabiskan ruang layar terus-menerus saat guru menggulir daftar
    // panjang, tapi header kolom (No/Nama/Nilai/dst) tetap terlihat.
    ws.views = [{ state: "frozen", ySplit: barisHeader }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const slugMapel = opts.mapelNama.replace(/\s+/g, "_").toLowerCase();
  const slugCakupan =
    opts.perKelas.length === 1
      ? opts.perKelas[0].kelasNama.replace(/\s+/g, "_")
      : "semua_kelas";
  a.download = `rekap_nilai_${slugMapel}_${slugCakupan}.xlsx`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
