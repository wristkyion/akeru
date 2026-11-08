# Akeru

A local, self-hosted character chat app, similar to Character.AI. Run it on your own PC, create characters, and chat with them using local models (llama.cpp, Ollama, LM Studio) or API providers (9router, and any other OpenAI-compatible endpoint). Several people can share one server, each with private chats and their own profile.

## Features

- **Characters** with name, description, definition, personality, greeting, and tags. Each character gets its own persona in every request.
- **Placeholders:** `{{char}}` and `{{user}}` in greetings and character text, filled in when a chat starts.
- **Accounts:** an admin plus regular users, each with a username and password. Passwords are stored as salted hashes.
- **Change password:** from the Settings page, or from the CLI for a forced reset.
- **Open sign-up (optional):** new people can create their own accounts at `/signup`. Turn it on or off in settings.
- **Visibility:** characters are public (everyone can chat) or private (only the owner can chat; the admin can see that it exists).
- **Private chats:** each chat belongs to one user. Nobody else can read it, including the admin.
- **Past chats:** each character lists its chats under it in the sidebar, with titles from the first message. Rename and delete any of them.
- **Chat addresses:** every chat has its own link, and refresh and back/forward keep you in the same chat.
- **Message actions:** edit a message, save and resend it, refresh the newest reply, delete a single message, or **Generate** another message from the character.
- **Generate:** when the box is empty, the button adds one more message from the character after its last reply. Each press counts as one request against the daily limit.
- **Streaming and reveal:** replies appear word by word in the browser, with a fade. Choose Instant or Smooth in Settings.
- **Formatting:** `**bold**` and `*italic*` in messages, without HTML.
- **Admin-controlled generation:** temperature, context size, max reply length, and the other parameters are set by the admin, for every user. The server enforces them, so the browser can't change them.
- **Daily message limit:** regular users get a set number of messages per day, shown in the chat. Admins are exempt.
- **Maintenance mode:** the admin can switch it on in the admin panel. The server refuses chat writes for regular users, and the app sends them to a maintenance page. Admins keep full access.
- **Settings page:** profile, account, chat, display (theme, icon shape, language), and advanced options. It opens as a modal over whatever screen you're on.
- **Admin panel:** overview, accounts, plans, models (with the generation parameters), moderation, and system tools. Parts of it are still prototype.
- **Sessions:** logging in gives each device its own token. Admins can see and revoke sessions.
- **Login protection:** repeated failed logins lock the account or IP for 15 minutes.
- **Model switching:** pick any model from any configured provider, as `provider/model`.
- **Web app:** a Character.AI-style layout. The sidebar lists your characters and their chats, the chat screen has a character profile panel on the right, and phones get slide-in drawers for both.
- **Terminal UI:** a three-panel interface with scrolling, retry, and live message display.
- **CLI:** manage characters, accounts, sessions, and chats from the terminal.

## Requirements

- Windows, macOS, or Linux
- Node.js 20 or newer
- pnpm (`npm i -g pnpm`)
- At least one model source: a local server, or an API key for a provider

## First-time setup

Clone the repo, then run these from the project root:

```powershell
pnpm install
```

Copy the settings template to a live file. The live file is ignored by Git, so it stays on your PC:

```powershell
copy config\settings.example.json config\settings.json
```

Create the first admin account. You'll be asked for a password twice, and it won't show on screen:

```powershell
cd apps\cli
pnpm cli user add admin --role admin --name "Your Name" --persona "A short description of you, shared with characters"
```

Build the web app and start the server:

```powershell
cd ..\web
pnpm build
cd ..\server
pnpm start
```

Open `http://localhost:3000` on this PC. From a phone on the same Wi-Fi, see **Phone access** below.

To work on the web app with hot reload, keep the server running and start the dev server in a second window:

```powershell
cd apps\web
pnpm dev
```

Then open `http://localhost:5173`. The dev server reads the server port from `config\settings.json` and forwards `/api` requests to it.

The database file (`config\chars.db`) is created the first time the server or CLI runs. Characters and chats that existed before accounts were added belong to the first admin.

## Configuration

Settings live in `config\`:

- `settings.example.json`: the template with safe defaults. Committed to Git.
- `settings.json`: your live settings, copied from the template. Not committed.
- `secrets.json`: API keys, keyed by provider id. Not committed.
- `chars.db`: the SQLite database. Not committed.

Example `settings.json`:

```json
{
  "server": { "host": "0.0.0.0", "port": 3000 },
  "database": { "path": "config/chars.db" },
  "chat": { "historyLimit": 40 },
  "limits": { "dailyMessages": 50 },
  "auth": { "signup": "closed" },
  "providers": [
    { "id": "9router", "baseUrl": "http://localhost:20128/v1", "models": [] },
    { "id": "llamacpp", "baseUrl": "http://localhost:8080/v1", "models": [] }
  ]
}
```

- **`server.port`** sets the port. Change it if another program uses 3000, then restart the server.
- **`server.host`** `0.0.0.0` lets other devices connect. `127.0.0.1` allows only this PC.
- **`database.path`** sets the database file. Use a different file for each separate instance.
- **`chat.historyLimit`** is the starting context size. The admin's generation policy can override it from the admin panel.
- **`limits.dailyMessages`** is how many messages each regular user can send per day. `0` means unlimited. Admins are never limited.
- **`auth.signup`** is `"open"` to let people create accounts at `/signup`, or `"closed"` so only the admin can create them, from the CLI.

Keys go in `secrets.json`, keyed by provider id:

```json
{ "9router": "your-key-here" }
```

Local servers usually need no key.

Models are referenced as `providerId/modelId`, for example `9router/claude-haiku-4.5-combo` or `llamacpp/qwen2.5-7b`. Any server with an OpenAI-compatible `/v1/chat/completions` endpoint works.

## Accounts and roles

| | Admin | User |
|---|---|---|
| Log in from web or app | Yes | Yes |
| Create accounts | From the CLI, or at `/signup` if sign-up is open | Only at `/signup`, if open |
| Create, list, disable, and reset users | Yes (CLI, on the server PC) | No |
| See and revoke sessions | Yes | Own sessions only |
| Set generation parameters | Yes (Admin panel → Models) | No |
| Use the app during maintenance | Yes | No (sent to the maintenance page) |
| Daily message limit | Exempt | Applies |
| See public characters | Yes | Yes |
| See private characters | Yes, with the owner's name | Own only |
| Chat with a public character | Yes | Yes |
| Chat with a private character | Own only | Own only |
| Read another user's chat | No | No |
| Edit a character | Owner only | Owner only |
| Delete a character | Owner, or admin | Owner only |

Sign-up always creates regular users, never admins. These names are reserved and can't be used: `admin`, `root`, `system`, `akeru`, `support`. Each IP address gets 5 sign-up attempts per 15 minutes.

## Character visibility

- **Public:** every user can see and chat with it.
- **Private:** only the owner can chat with it. The admin can see it and who created it, but cannot chat with it.
- Changing a character from public to private cuts off existing chats with users who don't own it. Those chats stop accepting messages, but the history stays in the database.

## Addresses (routes)

The web app has real addresses, so refresh, back and forward, and shared links work.

| Address | Shows |
|---|---|
| `/login` | Log in. Logged-in users are sent to `/home`. |
| `/signup` | Create an account, when sign-up is open. Otherwise sends to `/login`. |
| `/home` | Your characters and the other characters you can see. |
| `/search?q=...` | Home, with the search filled in. |
| `/character/new` | Create a character. |
| `/character/:id` | The character's newest chat. |
| `/character/:id/:chatId` | One specific chat. |
| `/character/:id/edit` | Edit a character you own. |
| `/error?type=maintenance` | The maintenance page, for regular users while maintenance is on. |

If you're logged out and open any other address, you're sent to `/login?next=<that address>`, and after logging in you return to it.

## API

Every route except the public ones requires a login token. Send it as `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Server and database status |
| GET | `/api/public-config` | Public | Whether sign-up is open |
| POST | `/api/login` | Public | Log in, returns a token |
| POST | `/api/signup` | Public, when sign-up is open | Create a regular account, returns a token |
| GET | `/api/maintenance` | Public to logged-in users | Whether maintenance is on, and its message |
| PUT | `/api/maintenance` | Admin | Turn maintenance on or off, with a message |
| POST | `/api/logout` | Logged in | End the current session |
| GET | `/api/me` | Logged in | The current account |
| POST | `/api/me/password` | Logged in | Change your own password |
| GET | `/api/me/usage` | Logged in | Messages sent today and the daily limit |
| GET | `/api/generation-policy` | Logged in | The generation parameters in effect |
| PUT | `/api/generation-policy` | Admin | Change the generation parameters for everyone |
| GET | `/api/characters` | Logged in | Characters you can see |
| POST | `/api/characters` | Logged in | Create a character you own |
| GET | `/api/characters/:id` | Logged in | One character, if visible |
| PUT | `/api/characters/:id` | Owner | Edit a character |
| DELETE | `/api/characters/:id` | Owner, or admin | Delete a character and its chats |
| GET | `/api/characters/:characterId/chats` | Logged in | Your chats with a character |
| POST | `/api/chats` | Logged in | Start a chat (saves the greeting) |
| PATCH | `/api/chats/:id` | Chat owner | Rename a chat |
| DELETE | `/api/chats/:id` | Chat owner | Delete a chat |
| GET | `/api/chats/:id/messages` | Chat owner | Chat history |
| POST | `/api/chats/:id/messages` | Chat owner | Send a message, wait for the full reply |
| POST | `/api/chats/:id/stream` | Chat owner | Send a message, stream the reply (Server-Sent Events) |
| POST | `/api/chats/:id/generate` | Chat owner | Add one more message from the character after the last one |
| PATCH | `/api/messages/:id` | Message owner | Edit a message; with `resend`, write a new reply |
| POST | `/api/messages/:id/regenerate` | Chat owner | Replace the newest assistant reply |
| DELETE | `/api/messages/:id` | Message owner | Delete one message |
| GET | `/api/models` | Logged in | Models from all providers |

Login returns the token once. The server stores only a hash of it, so a leaked database can't be used to log in. Tokens expire after 30 days.

Generation settings in send and generate requests are validated, but the server uses the admin's policy instead, so values sent from the browser don't change the model's behavior.

Failed sends return these codes: `429` for the daily limit, `503` for maintenance, `502` when the model call fails. Failed sends save nothing, so retrying can't create duplicate messages.

## CLI

Run from `apps\cli`. Commands act as the first admin unless you add `--user <name>`.

Characters:

```powershell
pnpm cli list
pnpm cli show <character>
pnpm cli create --name "Aria" --description "..." --greeting "..." --public
pnpm cli edit <character> --personality "..." --visibility private
pnpm cli delete <character>
pnpm cli chats <character>
```

Chatting:

```powershell
pnpm cli chat <character> --model 9router/claude-haiku-4.5-combo
pnpm cli ui
pnpm cli models
```

Run as a regular user, to test their view:

```powershell
pnpm cli list --user test
pnpm cli ui --user test
```

Accounts:

```powershell
pnpm cli user add <username> --role user --name "Display Name" --persona "..."
pnpm cli user list
pnpm cli user profile <username> --name "..." --persona "..."
pnpm cli user disable <username>
pnpm cli user enable <username>
pnpm cli user reset-password <username>
pnpm cli user sessions [username]
pnpm cli user revoke <username>
```

`reset-password` sets a temporary password. The user is asked to choose their own at next login, and every session is signed out.

Passwords are typed into a hidden prompt, so they don't show on screen or go into shell history.

## Web app

Open `http://localhost:3000` (built) or `http://localhost:5173` (dev server).

- **Log in** at `/login`. The token is saved in the browser, so you stay logged in until you log out.
- **Create an account** at `/signup`, when the admin has turned on open sign-up.
- **Sidebar:** your name, search, Home, Create character, your characters with their chats underneath, and Settings and Log out at the bottom.
- **Click a character** to open its chat. The greeting appears first, and your message shows right away while the reply is generated.
- **Chat panel** on the right shows the character's profile, with like, share, and report (prototype), plus its description and tags. Owners see **Edit character** there.
- **Edit character** has a delete option at the bottom, for owners only.
- **Composer button:** when the box has text it shows **Send**. When the box is empty it shows **Generate**, which adds the character's next message.
- **Message actions:** Edit changes the text. Save & resend writes a new reply and removes the messages after it. Refresh replaces the newest reply. Delete removes one message.
- **Enter** sends. **Shift+Enter** adds a new line.
- **Settings** opens as a modal, from the sidebar or the chat. It has these sections:
  - **Profile:** username, display name, bio.
  - **Account:** email and password. Other devices are signed out after a password change.
  - **Chat:** template, the model set by the admin, reply animation (Instant or Smooth), personas, and the generation parameters (admins only; users see a note).
  - **Display:** language, dark or light theme, and round or square icons.
  - **Advanced:** debug info and clearing browser data.
  - **Admin panel** (admins only): overview, accounts, plans, models (including the generation parameters), moderation, and system (including maintenance mode).
- **On phones**, the chat bar has a sidebar icon on the left and a character icon on the right. Each opens its panel as a drawer, closed by tapping the dark area.

## Phone access

Your phone can't reach the PC over Wi-Fi if the router isolates devices. That's the usual cause of `ERR_ADDRESS_UNREACHABLE`. Two ways around it:

- **Tailscale (recommended):** install Tailscale on the PC and the phone with the same account. Open `http://<tailscale-address>:3000` on the phone. Use the address the Tailscale app shows, which starts with `100.`. Traffic is encrypted, and it works outside your home.
- **Same Wi-Fi:** turn off AP isolation (Client Isolation) in the router, then open `http://<PC-address>:3000`. Allow the port through Windows Firewall on Private networks.

Find the PC's address with `ipconfig`. Test the connection from the PC first with `ping <phone-address>`.

## Backup

`config\chars.db` holds every account and chat, and it isn't in Git. Back it up regularly. The repo includes a script that copies it to a dated file:

```powershell
cd D:\data\docs\project\akeru
.\backup-akeru.ps1
```

Copy the database to a different drive, not the same disk. Back up `config\settings.json` and `config\secrets.json` as well, since the database script doesn't include them.

To restore, stop the server, copy a backup over `config\chars.db`, and start the server again.

## Tests

Unit tests cover the database, accounts, passwords, sign-up rules, visibility, sessions, login limits, the daily limit, tags, placeholders, streaming, chat titles, password change, message actions, and generation:

```powershell
cd packages\core
pnpm test
```

Expect 44 passing tests.

End-to-end checks run against a running server. They log in as both accounts, test visibility, permissions, chat privacy, failed sends, and logout, then remove their own test characters. They never call a model.

Start the server in one window:

```powershell
cd apps\server
pnpm start
```

Then in a second window:

```powershell
cd apps\server
$env:AKERU_ADMIN_PASS = 'admin password'
$env:AKERU_TEST_PASS = 'test password'
pnpm exec tsx scripts\e2e.ts
```

Expect `21 passed, 0 failed`. Use single quotes around passwords, since PowerShell treats `$` and `@` specially inside double quotes.

Don't run the manual lockout test before the end-to-end script, because it locks the account for 15 minutes.

Run both checks after any server or route change: unit tests first, then the end-to-end script, then commit.

## Troubleshooting

- **`EADDRINUSE`:** another program uses the port. Change `server.port` in `settings.json`, or find the process with `netstat -ano | findstr :3000`.
- **`ECONNREFUSED` in the dev server terminal:** the Akeru server isn't running. Start it with `pnpm start` in `apps\server`. Both windows must run together.
- **`500` errors after editing server files:** restart the server. Route changes don't load until it restarts.
- **`ERR_ADDRESS_UNREACHABLE` on the phone:** see **Phone access**.
- **Blank page, or `X is not defined` in the browser console:** a file was edited partly. Replace the whole file, and check that every component you use is imported.
- **Duplicate declarations in the dev server terminal** (`has already been declared`): a line was pasted twice. Delete the second copy.
- **`Multiple exports with the same name`:** a function was pasted twice. Search the file for the name and delete the older copy.
- **`duplicate column name` on startup:** the migration list was edited out of order. Keep the existing migrations in place, and add new ones only at the end.
- **`login required` (401):** the request has no token, or the token was revoked. Log in again.
- **`too many attempts` (429):** wait 15 minutes, or restart the server to clear the limit.
- **`invalid username or password`:** check the password, or reset it with `pnpm cli user reset-password <name>`.
- **`daily limit reached`:** the account has used its messages for today. It resets at midnight, or raise `limits.dailyMessages`.
- **`Akeru is under maintenance`:** the admin has maintenance on. Turn it off in Admin panel → System, or sign in as admin.
- **A model error after a parameter change:** the provider may not support that setting. Turn it off in Admin panel → Models.
- **`415 Unsupported Media Type`:** a POST request is missing its `Content-Type`. Add `-ContentType "application/json"` with a body such as `'{}'`.
- **Model errors, or "No model available":** check `pnpm cli models` lists models. If it lists nothing, check the provider's `baseUrl` and that the provider is running.
- **Missing dependencies:** run `pnpm install` from the project root.

## Project structure

```
akeru/
├─ apps/
│  ├─ server/     Fastify API, login, sessions, maintenance, serves the web app
│  │  └─ scripts/e2e.ts   end-to-end checks
│  ├─ web/        React + Vite web app (routes, sidebar, chat, settings, admin)
│  └─ cli/        Terminal commands and terminal UI (Ink)
├─ packages/
│  └─ core/       Database, accounts, sign-up, sessions, visibility, limits,
│                 messages, generation policy, maintenance, providers
├─ config/        settings.example.json (template), settings.json, secrets.json, chars.db
├─ backup-akeru.ps1   copies chars.db to a dated backup file
└─ LIS.md         task list
```

## Status

Working: accounts, open sign-up, sessions, visibility rules, daily limits, past chats with their own addresses, message actions, Generate, streaming and the reveal, admin-controlled generation parameters, the maintenance workflow, the login and signup routes, the Settings modal, the character panel, phone drawers, the terminal UI, and the CLI.

Prototype only: most of the admin panel and the Profile, Account, Chat, and Display settings. They save in the browser, and the backend will replace them.

Not yet built: the lockdown page (`/error?type=lockdown`), the Stop button, the prompt size warning, per-character settings, and the terminal UI's parameters.
