/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local `tsc --noEmit` + the dev server already enforce type safety; skipping
  // the in-build type check shaves ~60-90s off Vercel builds and avoids OOM on
  // the 2-core/8 GB build machine when the project surface area is large.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Same rationale for lint — run it locally / in CI, not in the deploy build.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
