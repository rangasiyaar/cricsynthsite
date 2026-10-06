/** Static export: Firebase Hosting serves plain files; data comes from published JSON (later Firestore). */
const config = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default config;
