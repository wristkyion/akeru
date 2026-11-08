export const PREFS_KEY = "akeru.prefs";
export const MAX_PERSONAS = 5;

export type Theme = "dark" | "light";

export interface Persona {
  id: string;
  name: string;
  text: string;
}

export interface AdminUser {
  id: string;
  username: string;
  role: "user" | "admin";
  plan: string;
  status: "active" | "suspended" | "banned";
  dailyLimit: number; // 0 = unlimited
  messagesToday: number;
}

export interface AdminState {
  model: string; // "" = first available model
  maintenance: boolean;
  announcement: string;
  users: AdminUser[];
  log: string[];
}

export interface Prefs {
  profile: { username: string; displayName: string; bio: string };
  account: { email: string };
  display: { language: "en" | "id" | "ja"; theme: Theme; shape: "round" | "square" };
  chat: { template: string; animation: "instant" | "word" | "smooth"; personas: Persona[] };
  advanced: { debug: boolean };
  admin: AdminState;
}

// Mock accounts for the admin prototype. The backend will replace these with real data.
const MOCK_USERS: AdminUser[] = [
  { id: "a1", username: "admin", role: "admin", plan: "pro", status: "active", dailyLimit: 0, messagesToday: 0 },
  { id: "u1", username: "mia", role: "user", plan: "free", status: "active", dailyLimit: 50, messagesToday: 12 },
  { id: "u2", username: "kai", role: "user", plan: "pro", status: "active", dailyLimit: 300, messagesToday: 84 },
  { id: "u3", username: "rin", role: "user", plan: "free", status: "suspended", dailyLimit: 20, messagesToday: 0 },
];

function defaults(): Prefs {
  return {
    profile: { username: "", displayName: "", bio: "" },
    account: { email: "" },
    display: { language: "en", theme: "dark", shape: "round" },
    chat: { template: "default", animation: "word", personas: [] },
    advanced: { debug: false },
    admin: { model: "", maintenance: false, announcement: "", users: MOCK_USERS, log: [] },
  };
}

// Applies the theme and icon shape to the page. The CSS reads these attributes.
export function applyPrefs(p: Prefs): void {
  const el = document.documentElement;
  el.dataset.theme = p.display.theme;
  el.dataset.shape = p.display.shape;
}

export function loadPrefs(): Prefs {
  const base = defaults();
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Prefs>;
    return {
      profile: { ...base.profile, ...saved.profile },
      account: { ...base.account, ...saved.account },
      display: { ...base.display, ...saved.display },
      chat: { ...base.chat, ...saved.chat },
      advanced: { ...base.advanced, ...saved.advanced },
      admin: { ...base.admin, ...saved.admin },
    };
  } catch {
    return base;
  }
}

export function savePrefs(p: Prefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  applyPrefs(p);
}
