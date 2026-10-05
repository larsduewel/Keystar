// Bundles the worker and CLI scripts into self-contained ESM files in dist/,
// so the production image does not need the full node_modules tree.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: {
    worker: path.join(root, "src/worker/index.ts"),
    migrate: path.join(root, "src/scripts/migrate.ts"),
    "demo-seed": path.join(root, "src/scripts/demo-seed.ts"),
    support: path.join(root, "src/scripts/support-package.ts"),
  },
  outdir: path.join(root, "dist"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  alias: { "@": path.join(root, "src") },
  // Some CommonJS dependencies call require(); provide it in the ESM bundle.
  banner: {
    js: "import { createRequire as __ksCreateRequire } from 'node:module'; const require = __ksCreateRequire(import.meta.url);",
  },
  logLevel: "info",
});
