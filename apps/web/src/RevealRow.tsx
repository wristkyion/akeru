import { useEffect, useMemo, useRef, useState } from "react";
import { splitBubbles } from "./bubbles";
import { Avatar } from "./Avatar";
import { Formatted } from "./Markdown";
import type { RevealMode } from "./reveal";

const TICK_MS = 110; // time between reveal steps
const BUBBLE_PAUSE_MS = 700; // pause before a new bubble starts
const MAX_STEPS = 70; // a reply finishes in about 8 seconds at most

interface Token {
  text: string; // a word and its trailing spaces
  bubble: number; // which bubble it belongs to
}

// Shows one saved reply as one or more bubbles, revealed word by word.
// Each bubble starts after the one before it, with a short pause between them.
export function RevealRow({
  name,
  text,
  mode,
  onDone,
  picId,
}: {
  name: string;
  text: string;
  mode: RevealMode;
  onDone: () => void;
  picId?: string | null;
}) {
  const bubbles = useMemo(() => splitBubbles(text), [text]);

  // Every word in order, tagged with the bubble it belongs to
  const tokens = useMemo<Token[]>(() => {
    if (mode === "instant") return [];
    const out: Token[] = [];
    bubbles.forEach((b, bubble) => {
      (b.match(/\S+\s*|\s+/g) ?? []).forEach((t) => out.push({ text: t, bubble }));
    });
    return out;
  }, [bubbles, mode]);

  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const finished = mode === "instant" || count >= tokens.length;

  // Step forward through the words, pausing longer when a new bubble starts
  useEffect(() => {
    if (finished) return;
    const batch = Math.max(1, Math.ceil(tokens.length / MAX_STEPS));
    const next = Math.min(tokens.length, count + batch);
    const startsNewBubble =
      count > 0 && tokens.slice(count, next).some((t) => t.bubble !== tokens[count - 1].bubble);
    const timer = setTimeout(() => setCount(next), startsNewBubble ? BUBBLE_PAUSE_MS : TICK_MS);
    return () => clearTimeout(timer);
  }, [count, tokens, finished]);

  // Keep the newest words in view while the reply is revealed
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [count]);

  useEffect(() => {
    if (finished) onDone();
  }, [finished]);

  // The words revealed so far, grouped by bubble
  const shown: string[][] = bubbles.map(() => []);
  tokens.slice(0, count).forEach((t) => shown[t.bubble].push(t.text));
  const current = count > 0 ? tokens[count - 1].bubble : 0;

  return (
    <div className="msg" ref={ref}>
      <Avatar name={name} pictureId={picId} className="avatar msg-avatar" />
      <div className="msg-body">
        <div className="msg-name">
          <span>{name}</span>
          <span className="badge">AI</span>
        </div>

        {finished
          ? bubbles.map((b, i) => (
              <div key={i} className="bubble">
                <Formatted text={b} />
              </div>
            ))
          : shown.map(
              (words, i) =>
                words.length > 0 && (
                  <div key={i} className="bubble">
                    {words.map((w, j) => (
                      <span key={j} className="w-in">
                        {w}
                      </span>
                    ))}
                    {i === current && <span className="caret" />}
                  </div>
                ),
            )}
      </div>
    </div>
  );
}
