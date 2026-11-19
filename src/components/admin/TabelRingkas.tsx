"use client";

/** Tabel kecil berguling untuk pratinjau/hasil impor akun. */
export default function TabelRingkas({
  kepala,
  baris,
  sisa = 0,
  bahaya = false,
}: {
  kepala: string[];
  baris: string[][];
  sisa?: number;
  bahaya?: boolean;
}) {
  return (
    <div className="max-h-64 overflow-auto rounded-md border border-ink/10">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-paper-dark/80">
          <tr>
            {kepala.map((k) => (
              <th key={k} className="px-3 py-2">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {baris.map((b, i) => (
            <tr key={i} className="border-t border-ink/5">
              {b.map((sel, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 ${bahaya && j === b.length - 1 ? "text-danger" : ""} ${
                    kepala[j] === "Password" || kepala[j] === "Username" ? "font-mono" : ""
                  }`}
                >
                  {sel}
                </td>
              ))}
            </tr>
          ))}
          {sisa > 0 && (
            <tr className="border-t border-ink/5">
              <td colSpan={kepala.length} className="px-3 py-1.5 text-ink/40">
                … dan {sisa} lainnya (lengkapnya di Excel)
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
