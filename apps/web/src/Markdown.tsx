import type { ReactNode } from "react";

// Renders **bold**, *italic*, and _italic_. Everything else stays plain text,
// so message content never becomes HTML.
const PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;

export function Formatted({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));

    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = start + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
