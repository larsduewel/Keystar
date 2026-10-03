/**
 * What a server action behind a toast returns: refusals are codes the page
 * translates, not thrown English messages (see `ActionForm`).
 */
export type ActionResult<E extends string = string> = { ok: true } | { ok: false; error: E };

export const ok = { ok: true } as const;

export function refused<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
