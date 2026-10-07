const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** `[major, minor, patch]` of a plain version such as "0.14.0" (no "v", no pre-release suffix), or null. */
export function parseVersion(version: string): [number, number, number] | null {
  const m = SEMVER.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Orders two plain versions numerically (0.10.0 after 0.9.0): negative, zero or positive. Unparsable ones sort first. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a) ?? [-1, -1, -1];
  const pb = parseVersion(b) ?? [-1, -1, -1];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}
