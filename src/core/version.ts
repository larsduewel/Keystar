import pkg from "../../package.json";

/**
 * The running Keystar version, from package.json at build time. Releases are
 * cut from it: see docs/releasing.md.
 */
export const KEYSTAR_VERSION: string = pkg.version;

export interface BuildInfo {
  version: string;
  /** Git commit the image was built from (KEYSTAR_COMMIT build arg); null outside published images. */
  commit: string | null;
  /** Image tag, e.g. "0.11.0" or "main" (KEYSTAR_IMAGE_TAG build arg). */
  imageTag: string | null;
  /** ISO timestamp of the image build (KEYSTAR_BUILD_DATE build arg). */
  buildDate: string | null;
  /** Dependency versions as declared in package.json. */
  dependencies: Record<string, string>;
}

const KEY_DEPENDENCIES = ["next", "react", "drizzle-orm", "postgres", "zod"] as const;

/** Build metadata. The image's build args are read at runtime, so `next build` doesn't freeze them. */
export function buildInfo(): BuildInfo {
  const deps: Record<string, string> = pkg.dependencies;
  return {
    version: KEYSTAR_VERSION,
    commit: process.env.KEYSTAR_COMMIT || null,
    imageTag: process.env.KEYSTAR_IMAGE_TAG || null,
    buildDate: process.env.KEYSTAR_BUILD_DATE || null,
    dependencies: Object.fromEntries(KEY_DEPENDENCIES.filter((d) => deps[d]).map((d) => [d, deps[d]])),
  };
}

export interface VersionLabel {
  /** Footer text, e.g. "Keystar v0.12.0" or "Keystar v0.12.0 · main @ c7bfb85". */
  text: string;
  /** Where the footer links: the releases page, or the commit for a non-release build. */
  href: string;
  /** True for an image that isn't a release: tag other than the version (e.g. "main"). */
  prerelease: boolean;
}

/**
 * What the sidebar footer shows. A release image (tag equals the package version, or no build
 * info at all, as in `pnpm dev`) shows just the version. Anything else, e.g. the `:main` image,
 * also shows its tag and short commit so a test server isn't mistaken for the last release.
 */
export function versionLabel(info: BuildInfo, sourceUrl: string): VersionLabel {
  const { version, imageTag, commit } = info;
  const base = sourceUrl.replace(/\/+$/, "");
  const prerelease = Boolean(commit) && Boolean(imageTag) && imageTag !== version && imageTag !== `v${version}`;
  if (!prerelease || !commit) return { text: `Keystar v${version}`, href: releasesUrl(sourceUrl), prerelease: false };
  return { text: `Keystar v${version} · ${imageTag} @ ${commit.slice(0, 7)}`, href: `${base}/commit/${commit}`, prerelease: true };
}

/** The repository's list of GitHub releases (`SOURCE_URL`). */
export function releasesUrl(sourceUrl: string): string {
  return `${sourceUrl.replace(/\/+$/, "")}/releases`;
}

/** The GitHub release page of `version` (tags are `v<version>`, see .github/workflows/release.yml). */
export function releaseUrl(sourceUrl: string, version: string): string {
  return `${releasesUrl(sourceUrl)}/tag/v${version}`;
}
