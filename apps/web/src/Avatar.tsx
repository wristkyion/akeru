import { useEffect, useState } from "react";
import { tokenStore } from "./api";
import { avatarStyle, initials } from "./ui";

// Pictures need the login token, which an <img> tag can't send. So each picture is fetched
// once with the token, and shown from a temporary local address. The cache clears on reload.
const cache = new Map<string, Promise<string | null>>();

export function pictureSrc(pictureId: string): Promise<string | null> {
  let hit = cache.get(pictureId);
  if (!hit) {
    const token = tokenStore.get();
    hit = fetch(`/api/pictures/${pictureId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null)
      .then((src) => {
        // Don't keep a failed load, so the next render tries again
        if (!src) cache.delete(pictureId);
        return src;
      });
    cache.set(pictureId, hit);
  }
  return hit;
}

// Shows the picture when there is one, otherwise the same initials avatar as before.
// className holds the size classes the screen already uses, such as "avatar avatar-xs".
export function Avatar({
  name,
  pictureId,
  className = "avatar",
}: {
  name: string;
  pictureId: string | null | undefined;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!pictureId) {
      setSrc(null);
      return;
    }
    pictureSrc(pictureId).then((s) => {
      if (alive) setSrc(s);
    });
    return () => {
      alive = false;
    };
  }, [pictureId]);

  if (src) return <img className={`${className} avatar-img`} src={src} alt="" />;
  return (
    <span className={className} style={avatarStyle(name)}>
      {initials(name)}
    </span>
  );
}
