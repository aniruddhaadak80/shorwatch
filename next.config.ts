import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * PGlite ships a WebAssembly build plus a loader hook. Bundling it into the
   * server output rewrites that hook and instantiation fails at runtime
   * ("instantiateWasm is not a function"), so it is kept external and required
   * from node_modules at run time. Production uses Neon over HTTP and never
   * loads PGlite at all.
   */
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;