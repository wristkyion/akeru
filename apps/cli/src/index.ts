import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOwnedCharacter,
  createOwnedChat,
  createProviderRegistry,
  createUser,
  deleteOwnedCharacter,
  getUserByUsername,
  listAllModels,
  listMessages,
  listOwnChats,
  listUsers,
  listVisibleCharacters,
  loadProviderConfigs,
  loadSettings,
  openDatabase,
  sendChatMessage,
  setUserDisabled,
  setUserPassword,
  updateOwnedCharacter,
  updateUserProfile,
  listSessions,
  revokeUserSessions,
  startOwnedChat,
  type CharacterPatch,
  type CharacterView,
  type User,
  type Visibility,
} from "@chars/core";
import { askHidden } from "./prompt.js";
import { runUi } from "./ui.js";

// apps/cli/src -> project root
const root = fileURLToPath(new URL("../../../", import.meta.url));
const configDir = resolve(root, "config");
const settings = loadSettings(configDir);
const db = openDatabase(resolve(root, settings.database.path));
const configs = loadProviderConfigs(configDir);
const registry = createProviderRegistry(configs);

const program = new Command().name("akeru").description("Akeru command line");

// Global option: run as a specific account. Works before or after the command name.
program.option("-u, --user <username>", "act as this account (default: the first admin)");

// The account the command runs as
function actor(): User {
  const name = program.opts().user as string | undefined;
  if (name) {
    const u = getUserByUsername(db, name);
    if (!u) throw new Error(`no user "${name}"`);
    if (u.disabled) throw new Error(`user "${name}" is disabled`);
    return u;
  }
  const admin = listUsers(db).find((u) => u.role === "admin" && !u.disabled);
  if (!admin) throw new Error("no admin account yet. Create one: pnpm cli user add admin --role admin");
  return admin;
}

// Find a character you can see, by id, id prefix, or name (case-insensitive)
function findCharacter(ref: string): CharacterView {
  const all = listVisibleCharacters(db, actor());
  const byId = all.filter((c) => c.id === ref || c.id.startsWith(ref));
  const matches = byId.length
    ? byId
    : all.filter((c) => c.name.toLowerCase() === ref.toLowerCase());

  if (matches.length === 0) throw new Error(`no character matches "${ref}"`);
  if (matches.length > 1)
    throw new Error(`"${ref}" matches ${matches.length} characters, use a longer id`);
  return matches[0];
}

function parseVisibility(v: string | undefined): Visibility | undefined {
  if (v === undefined) return undefined;
  if (v !== "public" && v !== "private") throw new Error("visibility must be public or private");
  return v;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

function printCharacter(c: CharacterView) {
  console.log(`${c.name}  (${c.id})`);
  console.log(`  visibility:  ${c.visibility}${c.ownerName ? ` (by ${c.ownerName})` : ""}`);
  if (c.description) console.log(`  description: ${c.description}`);
  if (c.personality) console.log(`  personality: ${c.personality}`);
  if (c.greeting) console.log(`  greeting:    ${c.greeting}`);
}

// ---- Characters ----

program
  .command("list")
  .description("List characters you can see")
  .action(() => {
    const all = listVisibleCharacters(db, actor());
    if (all.length === 0) return console.log("No characters yet. Try: pnpm cli create --name Aria");
    for (const c of all)
      console.log(`${c.id.slice(0, 8)}  ${c.name.padEnd(20)} ${c.visibility.padEnd(8)} ${c.ownerName ?? ""}`);
  });

program
  .command("show <character>")
  .description("Show one character (name, id, or id prefix)")
  .action((ref: string) => printCharacter(findCharacter(ref)));

program
  .command("create")
  .description("Create a character you own")
  .requiredOption("-n, --name <name>")
  .option("-d, --description <text>")
  .option("-p, --personality <text>")
  .option("-g, --greeting <text>")
  .option("--public", "let every user see and chat with it")
  .action(
    (opts: {
      name: string;
      description?: string;
      personality?: string;
      greeting?: string;
      public?: boolean;
    }) => {
      const c = createOwnedCharacter(db, actor(), {
        name: opts.name,
        description: opts.description,
        personality: opts.personality,
        greeting: opts.greeting,
        visibility: opts.public ? "public" : "private",
      });
      console.log(`Created ${c.name} (${c.id.slice(0, 8)}), ${c.visibility}`);
    },
  );

program
  .command("edit <character>")
  .description("Change a character you own")
  .option("-n, --name <name>")
  .option("-d, --description <text>")
  .option("-p, --personality <text>")
  .option("-g, --greeting <text>")
  .option("-v, --visibility <public|private>")
  .action(
    (
      ref: string,
      opts: {
        name?: string;
        description?: string;
        personality?: string;
        greeting?: string;
        visibility?: string;
      },
    ) => {
      const c = findCharacter(ref);
      const patch: CharacterPatch = {
        name: opts.name,
        description: opts.description,
        personality: opts.personality,
        greeting: opts.greeting,
        visibility: parseVisibility(opts.visibility),
      };
      const changed = Object.values(patch).some((v) => v !== undefined);
      if (!changed)
        return console.log(
          "Nothing to change. Pass --name, --description, --personality, --greeting, or --visibility.",
        );
      printCharacter(updateOwnedCharacter(db, actor(), c.id, patch));
    },
  );

program
  .command("delete <character>")
  .description("Delete a character and all its chats (owner, or admin)")
  .option("-y, --yes", "skip the confirmation")
  .action(async (ref: string, opts: { yes?: boolean }) => {
    const c = findCharacter(ref);
    if (!opts.yes && !(await confirm(`Delete ${c.name} and all its chats? (y/N) `)))
      return console.log("Cancelled.");
    deleteOwnedCharacter(db, actor(), c.id);
    console.log(`Deleted ${c.name}`);
  });

program
  .command("chats <character>")
  .description("List your chats with a character")
  .action((ref: string) => {
    const c = findCharacter(ref);
    const chats = listOwnChats(db, actor(), c.id);
    if (chats.length === 0) return console.log("No chats yet.");
    for (const ch of chats)
      console.log(`${ch.id.slice(0, 8)}  ${new Date(ch.updatedAt).toLocaleString()}`);
  });

// ---- Models ----

program
  .command("models")
  .description("List models from every provider")
  .action(async () => {
    for (const p of await listAllModels(configs)) {
      if (p.error) {
        console.log(`${p.provider}: error: ${p.error}`);
        continue;
      }
      console.log(`${p.provider} (${p.models.length})`);
      for (const m of p.models) console.log(`  ${m}`);
    }
  });

// ---- Chat ----

program
  .command("chat <character>")
  .description("Chat in the terminal")
  .option("-m, --model <ref>", "provider/model, e.g. 9router/claude-haiku-4.5-combo")
  .option("--chat <chatId>", "continue an existing chat (id or prefix)")
  .option("-t, --temperature <n>")
  .option("--max-tokens <n>")
  .action(
    async (
      ref: string,
      opts: { model?: string; chat?: string; temperature?: string; maxTokens?: string },
    ) => {
      const me = actor();
      const c = findCharacter(ref);
      if (!c.canChat) throw new Error(`${c.name} is private to ${c.ownerName}. You can see it, but not chat.`);

      const options = {
        temperature: opts.temperature !== undefined ? Number(opts.temperature) : undefined,
        maxTokens: opts.maxTokens !== undefined ? Number(opts.maxTokens) : undefined,
      };

      let model = opts.model ?? process.env.AKERU_MODEL ?? "";
      if (!model) {
        model = (await listAllModels(configs)).flatMap((p) => p.models)[0] ?? "";
        if (!model) throw new Error("no models found; check config/settings.json or pass --model");
      }
      
      const startChat = () => startOwnedChat(db, me, c.id);

      let chat = opts.chat
        ? listOwnChats(db, me, c.id).find((x) => x.id.startsWith(opts.chat!))
        : undefined;
      if (opts.chat && !chat) throw new Error(`no chat matches "${opts.chat}"`);
      chat ??= startChat();

      const showHistory = (chatId: string) => {
        for (const m of listMessages(db, chatId).slice(-10))
          console.log(`${m.role === "user" ? me.displayName : c.name}> ${m.content}`);
      };

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      console.log(`Chatting with ${c.name} using ${model}. Type /help for commands.`);
      showHistory(chat.id);

      try {
        while (true) {
          const line = (await rl.question("you> ")).trim();
          if (!line) continue;
          if (line === "/exit") break;
          if (line === "/help") {
            console.log("/model <ref>  switch model\n/new          start a new chat\n/history      show recent messages\n/exit         quit");
            continue;
          }
          if (line === "/new") {
            chat = startChat();
            showHistory(chat.id);
            continue;
          }
          if (line === "/history") {
            showHistory(chat.id);
            continue;
          }
          if (line.startsWith("/model ")) {
            model = line.slice(7).trim();
            console.log(`model: ${model}`);
            continue;
          }

          try {
            const reply = await sendChatMessage({
              db,
              registry,
              characterId: c.id,
              chatId: chat.id,
              content: line,
              model,
              options,
              historyLimit: settings.chat.historyLimit,
              user: { name: me.displayName, persona: me.persona },
              actor: me,
              dailyLimit: settings.limits.dailyMessages,
            });
            console.log(`${c.name}> ${reply.content}`);
          } catch (err) {
            console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } finally {
        rl.close();
      }
    },
  );

program
  .command("ui")
  .description("Open the terminal chat interface")
  .option("-m, --model <ref>", "starting model, e.g. 9router/claude-haiku-4.5-combo")
  .action(async (opts: { model?: string }) => {
    const me = actor();
    const model =
      opts.model ??
      process.env.AKERU_MODEL ??
      (await listAllModels(configs)).flatMap((p) => p.models)[0] ??
      "";
    await runUi({
      db,
      registry,
      defaultModel: model,
      version: "0.1.0",
      historyLimit: settings.chat.historyLimit,
      actor: me,
      dailyLimit: settings.limits.dailyMessages,
    });
  });

// ---- User accounts (run on the server PC, as admin) ----

const users = program.command("user").description("Manage user accounts");

users
  .command("add <username>")
  .description("Create a user account")
  .option("-r, --role <role>", "admin or user", "user")
  .option("-n, --name <displayName>", "display name shown in chats")
  .option("-p, --persona <text>", "who this user is, shared with characters")
  .action(async (username: string, opts: { role: string; name?: string; persona?: string }) => {
    if (opts.role !== "admin" && opts.role !== "user") throw new Error("role must be admin or user");
    const password = await askHidden("Password: ");
    const again = await askHidden("Repeat password: ");
    if (password !== again) throw new Error("passwords do not match");
    const u = createUser(db, {
      username,
      password,
      role: opts.role as "admin" | "user",
      displayName: opts.name,
      persona: opts.persona,
    });
    console.log(`Created ${u.username} (${u.role})`);
  });

users
  .command("list")
  .description("List user accounts")
  .action(() => {
    const all = listUsers(db);
    if (all.length === 0) return console.log("No users yet. Create one with: pnpm cli user add <name>");
    for (const u of all) {
      const status = u.disabled ? "disabled" : "active";
      console.log(`${u.username.padEnd(16)} ${u.role.padEnd(6)} ${status.padEnd(9)} ${u.displayName}`);
    }
  });

users
  .command("disable <username>")
  .description("Block a user from logging in")
  .action((username: string) => {
    const u = setUserDisabled(db, username, true);
    console.log(`Disabled ${u.username}`);
  });

users
  .command("enable <username>")
  .description("Allow a disabled user to log in again")
  .action((username: string) => {
    const u = setUserDisabled(db, username, false);
    console.log(`Enabled ${u.username}`);
  });

users
  .command("reset-password <username>")
  .description("Set a new password for a user")
  .action(async (username: string) => {
    const password = await askHidden("New password: ");
    const again = await askHidden("Repeat password: ");
    if (password !== again) throw new Error("passwords do not match");
    setUserPassword(db, username, password);
    console.log(`Password changed for ${username}`);
  });

users
  .command("profile <username>")
  .description("Set the display name and persona used in chats")
  .option("-n, --name <displayName>")
  .option("-p, --persona <text>")
  .action((username: string, opts: { name?: string; persona?: string }) => {
    const u = updateUserProfile(db, username, { displayName: opts.name, persona: opts.persona });
    console.log(`${u.username}: name "${u.displayName}", persona ${u.persona ? "set" : "empty"}`);
  });

users
  .command("sessions [username]")
  .description("List logged-in devices, optionally for one user")
  .action((username?: string) => {
    const rows = listSessions(db, username);
    if (rows.length === 0) return console.log("No active sessions.");
    for (const s of rows) {
      console.log(
        `${s.id.slice(0, 8)}  ${s.username.padEnd(14)} ${s.deviceName.padEnd(28)} last seen ${new Date(s.lastSeenAt).toLocaleString()}`,
      );
    }
  });

users
  .command("revoke <username>")
  .description("Log a user out of every device")
  .action((username: string) => {
    const n = revokeUserSessions(db, username);
    console.log(`Revoked ${n} session(s) for ${username}`);
  });

// ---- Run ----

program
  .parseAsync()
  .catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
