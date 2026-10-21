/**
 * Penyaring SVG buatan AI untuk diagram soal.
 *
 * SVG ini TIDAK pernah disimpan atau ditampilkan ke siswa sebagai SVG:
 * di browser guru ia hanya dimuat sebagai `<img>` (konteks itu tidak
 * menjalankan skrip), digambar ke `<canvas>`, lalu diunggah sebagai PNG
 * lewat jalur unggah gambar biasa. Penyaring ini lapisan kedua — dan
 * yang lebih penting, ia membuang elemen yang membuat canvas "tercemar"
 * (gambar eksternal, foreignObject) sehingga ekspor PNG-nya gagal.
 */

export const BATAS_SVG_BYTE = 250_000;

export function bersihkanSvg(mentah: string): string | null {
  if (!mentah || mentah.length > BATAS_SVG_BYTE) return null;
  const m = /<svg[\s\S]*<\/svg>/i.exec(mentah);
  if (!m) return null;

  let svg = m[0]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<image\b[^>]*>(?:[\s\S]*?<\/image\s*>)?/gi, "")
    .replace(/<(iframe|object|embed|audio|video)\b[\s\S]*?(?:<\/\1\s*>|\/>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // href hanya boleh ke elemen di dalam SVG itu sendiri (#id).
    .replace(/\s(?:xlink:)?href\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "");

  if (!/xmlns\s*=/.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}
