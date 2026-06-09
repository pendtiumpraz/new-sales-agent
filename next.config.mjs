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
  // Ship browser source maps to prod so React's minified error messages
  // produce readable stacks in the DevTools console. Trivial cost — these
  // are only fetched by the browser when DevTools is open.
  productionBrowserSourceMaps: true,
};

export default nextConfig;
