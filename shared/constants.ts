/** Domains blocked per GEMINI.md §2 (YouTube / Chrome Web Store policy) */
export const BLOCKED_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'googlevideo.com',
  'm.youtube.com',
  'music.youtube.com',
] as const;

/** Check if a domain (or its parent) is blocked */
export function isBlockedDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return BLOCKED_DOMAINS.some(
    (blocked) => d === blocked || d.endsWith('.' + blocked),
  );
}
