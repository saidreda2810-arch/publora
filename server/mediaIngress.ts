/**
 * mediaIngress.ts — WP1: block new media-in-DB writes.
 *
 * Rejects `data:` URLs and oversized strings in media-reference fields on
 * every ingress path that can persist them (brand create/patch, profile
 * avatar, workspace state blob). Clients must upload via /api/media instead.
 *
 * Grandfathering: a value identical to what is already stored is allowed, so
 * clients can round-trip legacy data:-URL records until extraction (WP5)
 * rewrites them. Only NEW or CHANGED bad values are rejected.
 */

// data:<mime>/<subtype>... — must look like an actual data URL, not prose
// that happens to start with "data:".
const DATA_URL_RE = /^data:[a-zA-Z][\w.+-]*\/[\w.+-]+/;

// Field names that hold image/media references.
const MEDIA_KEY_RE = /(avatar|logo|cover|image|photo|thumbnail|picture|banner)/i;

export const MAX_MEDIA_FIELD_CHARS = 4096;
export const MEDIA_INGRESS_ERROR_CODE = 'media_must_use_upload_api';

export function isDataUrlString(value: string): boolean {
  return typeof value === 'string' && DATA_URL_RE.test(value.trimStart());
}

function isMediaKey(key: string | undefined): boolean {
  return !!key && MEDIA_KEY_RE.test(key);
}

function badStringReason(key: string | undefined, s: string): string | null {
  if (isDataUrlString(s)) return `data: URL in field '${key ?? '<root>'}'`;
  if (isMediaKey(key) && s.length > MAX_MEDIA_FIELD_CHARS) {
    return `oversized media field '${key}' (${s.length} chars > ${MAX_MEDIA_FIELD_CHARS})`;
  }
  return null;
}

/**
 * Recursively compare `next` against `prev` (the currently stored value at the
 * same position). Returns human-readable violation descriptions.
 * Arrays of objects are paired by `id` when both sides have one, else by index.
 */
export function findMediaViolations(
  next: unknown,
  prev: unknown,
  path = '$',
  key?: string
): string[] {
  const out: string[] = [];

  if (typeof next === 'string') {
    const reason = badStringReason(key, next);
    if (reason && next !== prev) out.push(`${path}: ${reason}`);
    return out;
  }
  if (Array.isArray(next)) {
    const prevArr = Array.isArray(prev) ? prev : [];
    const prevById = new Map<string, unknown>();
    const allHaveId = prevArr.every((e) => e && typeof e === 'object' && typeof (e as any).id === 'string');
    if (allHaveId) for (const e of prevArr) prevById.set((e as any).id, e);
    next.forEach((item, i) => {
      let paired: unknown;
      if (allHaveId && item && typeof item === 'object' && typeof (item as any).id === 'string') {
        paired = prevById.get((item as any).id);
      } else {
        paired = prevArr[i];
      }
      out.push(...findMediaViolations(item, paired, `${path}[${i}]`, key));
    });
    return out;
  }
  if (next && typeof next === 'object') {
    const prevObj = prev && typeof prev === 'object' && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {};
    for (const [k, v] of Object.entries(next as Record<string, unknown>)) {
      out.push(...findMediaViolations(v, prevObj[k], `${path}.${k}`, k));
    }
  }
  return out;
}

/** Shallow check for flat request bodies (brand create/patch, profile). */
export function findTopLevelMediaViolations(body: unknown): string[] {
  return findMediaViolations(body, undefined, '$');
}
