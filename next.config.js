/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pustaka render stimulus soal AI (route /api/ai/stimulus & /ekstrak)
  // dimuat apa adanya dari node_modules, tidak dibundel — perilakunya sama
  // dengan yang diuji di src/lib/__tests__/ai-stimulus.test.mts.
  serverExternalPackages: ["vega", "vega-lite", "@antv/infographic", "linkedom", "@mozilla/readability", "mammoth"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

module.exports = nextConfig;
