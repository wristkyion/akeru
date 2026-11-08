export const PREFS_KEY = "akeru.prefs";
export const MAX_PERSONAS = 5;

export type Theme = "dark" | "light";

export interface Persona {
  id: string;
  name: string;
  text: string;
}

export interface Plan {
  name: string;
  dailyLimit: number; // 0 = unlimited
}

export interface AdminUser {
  id: string;
  username: string;
  role: "user" | "admin";
  plan: string;
  status: "active" | "suspended" | "banned";
  dailyLimit: number;
  messagesToday: number;
  sessions: number;
  forcePasswordChange: boolean;
  joined: string; // YYYY-MM-DD
}

export interface Report {
  id: string;
  character: string;
  creator: string;
  reason: string;
  reporter: string;
  status: "open" | "dismissed" | "actioned";
}

export interface AdminState {
  model: string; // "" = first available model
  fallbackModel: string;
  maintenance: boolean;
  announcement: string;
  signupOpen: boolean;
  plans: Plan[];
  users: AdminUser[];
  reports: Report[];
  blocklist: string[];
  features: Record<string, boolean>;
  messagesWeek: number[]; // last 7 days, oldest first
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

// Mock data for the admin prototype. The backend will replace these with real records.
const MOCK_USERS: AdminUser[] = [
  { id: "a1", username: "admin", role: "admin", plan: "pro", status: "active", dailyLimit: 0, messagesToday: 0, sessions: 1, forcePasswordChange: false, joined: "2026-01-02" },
  { id: "u1", username: "mia", role: "user", plan: "free", status: "active", dailyLimit: 50, messagesToday: 12, sessions: 2, forcePasswordChange: false, joined: "2026-02-14" },
  { id: "u2", username: "kai", role: "user", plan: "pro", status: "active", dailyLimit: 300, messagesToday: 84, sessions: 1, forcePasswordChange: false, joined: "2026-03-03" },
  { id: "u3", username: "rin", role: "user", plan: "free", status: "suspended", dailyLimit: 20, messagesToday: 0, sessions: 0, forcePasswordChange: true, joined: "2026-04-21" },
];

const MOCK_REPORTS: Report[] = [
  { id: "r1", character: "Social awkward boy", creator: "rin", reason: "Pretends to be a real person", reporter: "mia", status: "open" },
  { id: "r2", character: "Mira", creator: "kai", reason: "Offensive greeting", reporter: "rin", status: "dismissed" },
];

function defaults(): Prefs {
  return {
    profile: { username: "", displayName: "", bio: "" },
    account: { email: "" },
    display: { language: "en", theme: "dark", shape: "round" },
    chat: { template: "default", animation: "word", personas: [] },
    advanced: { debug: false },
    admin: {
      model: "",
      fallbackModel: "",
      maintenance: false,
      announcement: "",
      signupOpen: true,
      plans: [
        { name: "free", dailyLimit: 50 },
        { name: "pro", dailyLimit: 300 },
        { name: "team", dailyLimit: 1000 },
      ],
      users: MOCK_USERS,
      reports: MOCK_REPORTS,
      blocklist: ["spam"],
      features: { discover: false, stopButton: true, exportChats: false, personaTab: true },
      messagesWeek: [42, 58, 31, 77, 64, 90, 58],
      log: [],
    },
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
