export type IconName =
  | "home"
  | "chat"
  | "search"
  | "settings"
  | "logout"
  | "plus"
  | "sun"
  | "moon"
  | "like"
  | "share"
  | "flag";

const PATHS: Record<IconName, string[]> = {
  home: ["M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  chat: ["M4 5h16v11H8l-4 4z"],
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M20 20l-4.3-4.3"],
  settings: [
    "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
    "M19.4 13.5l1.9 1.5-2 3.4-2.3-.9a7.6 7.6 0 0 1-1.6.9l-.4 2.4h-4l-.4-2.4a7.6 7.6 0 0 1-1.6-.9l-2.3.9-2-3.4 1.9-1.5a7.5 7.5 0 0 1 0-1.9L3.6 10l2-3.4 2.3.9a7.6 7.6 0 0 1 1.6-.9L9.9 4h4l.4 2.4c.6.2 1.1.5 1.6.9l2.3-.9 2 3.4-1.9 1.5a7.5 7.5 0 0 1 0 1.9z",
  ],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  plus: ["M12 5v14", "M5 12h14"],
  sun: [
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  ],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  like: ["M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3", "M7 22V11l4-8a2 2 0 0 1 2 2v4h6.5a2 2 0 0 1 2 2.3l-1.4 7.4A2 2 0 0 1 18.1 22H7z"],
  share: ["M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7", "M16 6l-4-4-4 4", "M12 2v13"],
  flag: ["M5 22V3", "M5 4h11l-2 4 2 4H5"],
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
