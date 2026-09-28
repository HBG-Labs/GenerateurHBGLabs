export const CREATIVE_VOICE_SEGMENT_MAX_CHARACTERS = 400 as const;

/** Segmentation déterministe P2.3 : chaque fragment devient un voice_segment P1 affiché séparément. */
export function splitCreativeVoiceText(text: string): string[] {
  const result: string[] = [];
  let remaining = text.trim();
  while (remaining.length > CREATIVE_VOICE_SEGMENT_MAX_CHARACTERS) {
    const candidate = remaining.slice(0, CREATIVE_VOICE_SEGMENT_MAX_CHARACTERS + 1);
    const split = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'));
    const at = split > CREATIVE_VOICE_SEGMENT_MAX_CHARACTERS * 0.45
      ? split
      : CREATIVE_VOICE_SEGMENT_MAX_CHARACTERS;
    result.push(remaining.slice(0, at).trim());
    remaining = remaining.slice(at).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}
