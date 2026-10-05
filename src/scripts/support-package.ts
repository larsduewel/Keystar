/**
 * Writes the support package to stdout, for when the web app doesn't start
 * (System Info offers the same file as a download). Logs go to stderr.
 *
 *   pnpm support:package > keystar-support.json
 *   docker compose run --rm --no-deps -T worker node dist/support.mjs > keystar-support.json
 */
import { audit } from "@/core/audit";
import { closeDb } from "@/core/db";
import { runChecks } from "@/core/system/checks";
import { collectSystemSnapshot } from "@/core/system/collect";
import { buildSupportPackage, supportPackageFilename } from "@/core/system/support-package";

async function main(): Promise<void> {
  const snapshot = await collectSystemSnapshot({ source: "cli" });
  const pkg = buildSupportPackage(snapshot, runChecks(snapshot));
  process.stdout.write(JSON.stringify(pkg, null, 2) + "\n");
  if (snapshot.database.ok) {
    await audit({ action: "system.support_package", details: { filename: supportPackageFilename(pkg), source: "cli" } });
  }
  const failed = Object.keys(pkg.meta.collectorErrors);
  console.error(
    `Keystar support package ${supportPackageFilename(pkg)}` +
      (failed.length ? ` (could not collect: ${failed.join(", ")})` : ""),
  );
}

main()
  .catch((err) => {
    console.error("Could not create the support package:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
