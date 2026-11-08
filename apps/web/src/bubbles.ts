export const BUBBLE_MARK = "|||";
export const MAX_BUBBLES = 3;

// Splits one saved reply into the bubbles it should show.
// Empty parts are dropped. Parts beyond MAX_BUBBLES are joined into the last bubble.
export function splitBubbles(text: string): string[] {
  const parts = text
    .split(BUBBLE_MARK)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length === 0) return [text.trim()];
  if (parts.length <= MAX_BUBBLES) return parts;
  return [...parts.slice(0, MAX_BUBBLES - 1), parts.slice(MAX_BUBBLES - 1).join("\n")];
}
