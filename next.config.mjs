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
  // pptxgenjs (used by the superadmin slide-deck .pptx export) ships a single
  // bundle that references `node:fs`/`node:https` behind Node-only guards. Those
  // paths never run in the browser (the client uses the in-browser download
  // path), but webpack still tries to resolve the `node:` scheme for the client
  // bundle and errors. Rewrite the scheme + stub the core modules on the CLIENT
  // build only, so the server build is untouched.
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        os: false,
        path: false,
        stream: false,
        zlib: false,
      };
    }
    return config;
  },
};

export default nextConfig;
