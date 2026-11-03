/**
 * Render stimulus jadi SVG — SERVER-ONLY (dipakai /api/ai/stimulus).
 *
 * Pustaka berat (Vega, Vega-Lite, AntV Infographic) dimuat dinamis dan
 * hanya di server, jadi tidak ikut membebani bundel browser guru/siswa.
 * Tidak ada panggilan AI di sini — semuanya deterministik dari data.
 */

import {
  foreignObjectKeTeks,
  opsiInfografis,
  specGrafik,
  svgTabel,
  type Stimulus,
} from "@/lib/ai/stimulus";

export async function renderStimulusSvg(s: Stimulus): Promise<string> {
  switch (s.jenis) {
    case "tabel":
      return svgTabel(s);
    case "grafik": {
      const [vega, vl] = await Promise.all([import("vega"), import("vega-lite")]);
      const spec = vl.compile(specGrafik(s) as unknown as Parameters<typeof vl.compile>[0]).spec;
      const view = new vega.View(vega.parse(spec), { renderer: "none" });
      try {
        return await view.toSVG();
      } finally {
        view.finalize();
      }
    }
    case "infografis": {
      const { renderToString } = await import("@antv/infographic/ssr");
      const o = opsiInfografis(s);
      const mentah = await renderToString({ template: o.template, data: o.data, width: 900, height: 520 } as never);
      if (!/<svg[\s>]/i.test(mentah)) throw new Error("Infografis tidak terbentuk.");
      // Teks AntV ada di foreignObject → jadikan <text>; font bawaannya
      // (dimuat dari CDN AntV) diganti font sistem.
      return foreignObjectKeTeks(mentah).replace(
        /<svg\b/i,
        '<svg font-family="Arial, Helvetica, sans-serif"'
      );
    }
    case "bacaan":
      throw new Error("Stimulus bacaan tidak perlu dirender.");
  }
}
