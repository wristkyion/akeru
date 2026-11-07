# Akeru

A local, self-hosted character chat app, similar to Character.AI. Run it on your own PC, create characters, and chat with them using local models (llama.cpp, Ollama, LM Studio) or API providers (9router, and any other OpenAI-compatible endpoint). Several people can share one server, each with private chats and their own profile.

## Features

- **Characters** with name, description, personality, and greeting. Each character gets its own persona in every request.
- **Accounts:** an admin plus regular users, each with a username and password. Passwords are stored as salted hashes.
- **Open sign-up (optional):** new people can create their own accounts from the login screen. Turn it on or off in settings.
- **Visibility:** characters are public (everyone can chat) or private (only the owner can chat; the admin can see that it exists).
- **Private chats:** each chat belongs to one user. Nobody else can read it, including the admin.
- **Daily message limit:** regular users get a set number of messages per day, shown in the chat. Admins are exempt.
- **Sessions:** logging in gives each device its own token. Admins can see and revoke sessions.
- **Login protection:** repeated failed logins lock the account or IP for 15 minutes.
- **Model switching:** pick any model from any configured provider, as `provider/model`.
- **Chat settings:** temperature, max tokens, and how much history the model sees (default 40 messages).
- **Web app:** a login screen, a character list in a Character.AI-style layout, and a chat screen with retry. Works on PC and phone browsers.
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

Open `http://localhost:3000` on this PC. From a phone on the same Wi-Fi, use your PC's address (`ipconfig` shows it), for example `http://192.168.1.14:3000`.

To work on the web app with hot reload, keep the server running and start the dev server in a second window:

```powershell
cd apps\web
pnpm dev
```

Then open `http://localhost:5173`. The dev server reads the server port from `config\settings.json`.

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
- **`chat.historyLimit`** is how many past messages the model sees. Older messages stay in the database and on screen.
- **`limits.dailyMessages`** is how many messages each regular user can send per day. `0` means unlimited. Admins are never limited.
- **`auth.signup`** is `"open"` to let people create accounts from the login screen, or `"closed"` so only the admin can create them, from the CLI.

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
| Create accounts | From the CLI, or from the login screen if sign-up is open | Only if sign-up is open |
| Create, list, disable, and reset users | Yes (CLI, on the server PC) | No |
| See and revoke sessions | Yes | Own sessions only |
| Edit providers and settings | Yes | No |
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

## API

Every route except the public ones requires a login token. Send it as `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Server and database status |
| GET | `/api/public-config` | Public | Whether sign-up is open |
| POST | `/api/login` | Public | Log in, returns a token |
| POST | `/api/signup` | Public, when sign-up is open | Create a regular account, returns a token |
| POST | `/api/logout` | Logged in | End the current session |
| GET | `/api/me` | Logged in | The current account |
| GET | `/api/me/usage` | Logged in | Messages sent today and the daily limit |
| GET | `/api/characters` | Logged in | Characters you can see |
| POST | `/api/characters` | Logged in | Create a character you own |
| GET | `/api/characters/:id` | Logged in | One character, if visible |
| PUT | `/api/characters/:id` | Owner | Edit a character |
| DELETE | `/api/characters/:id` | Owner, or admin | Delete a character and its chats |
| GET | `/api/characters/:characterId/chats` | Logged in | Your chats with a character |
| POST | `/api/chats` | Logged in | Start a chat (saves the greeting) |
| GET | `/api/chats/:id/messages` | Chat owner | Chat history |
| POST | `/api/chats/:id/messages` | Chat owner | Send a message, get a reply |
| DELETE | `/api/chats/:id` | Chat owner | Delete a chat |
| GET | `/api/models` | Logged in | Models from all providers |

Login returns the token once. The server stores only a hash of it, so a leaked database can't be used to log in. Tokens expire after 30 days.

Failed sends return these codes: `429` for the daily limit, `502` when the model call fails. Failed sends save nothing, so retrying can't create duplicate messages.

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

Passwords are typed into a hidden prompt, so they don't show on screen or go into shell history.

## Terminal UI

Start it with `pnpm cli ui`.

- **Tab** switches between the character list and the message box.
- **Up/Down** and **Enter** choose a character from the list.
- **Enter** sends a message. Your message appears immediately, and the reply follows.
- **Ctrl+R** retries the last message. If a send fails, your text returns to the box.
- **Ctrl+N** starts a new chat with the selected character.
- **PgUp / PgDn** scroll through history.
- **/model provider/model** switches models.
- **/temp 0.7** and **/temp reset** set temperature (0 to 2).
- **/max 300** and **/max reset** set the maximum reply length.
- **/context 60** and **/context reset** set how many past messages the model sees.
- **/help** lists the commands. **/exit** or Ctrl+C quits.

## Web app

Open `http://localhost:3000` (built) or `http://localhost:5173` (dev server).

- **Log in** with your username and password. The token is saved in the browser, so you stay logged in until you log out.
- **Create an account** from the login screen, when the admin has turned on open sign-up.
- **Home** shows the characters you can see, split into your characters and other characters, with a search box.
- **Click a character** to open the chat. The greeting appears first, and your message shows right away while the reply is generated.
- **Enter** sends. **Shift+Enter** adds a new line.
- **Settings** in the chat header sets the model, temperature, and maximum reply length. These are saved in the browser.
- **New chat** starts a fresh conversation with the character. The dropdown switches between past chats.
- **Retry** appears when a send fails, and your text is kept in the box.
- The usage line under the message box shows how many messages you have left today.
- **Log out** ends this device's session only. Your other devices stay logged in.

## Tests

Unit tests cover the database, accounts, passwords, sign-up rules, visibility, sessions, login limits, and the daily limit:

```powershell
cd packages\core
pnpm test
```

Expect 24 passing tests.

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

## Troubleshooting

- **`EADDRINUSE`:** another program uses the port. Change `server.port` in `settings.json`, or find the process with `netstat -ano | findstr :3000`.
- **`ECONNREFUSED` in the dev server terminal:** the Akeru server isn't running. Start it with `pnpm start` in `apps\server`.
- **`Multiple exports with the same name`:** a function was pasted twice. Search the file for the name and delete the older copy.
- **`duplicate column name` on startup:** the migration list was edited out of order. Keep the existing migrations in place, and add new ones only at the end.
- **`login required` (401):** the request has no token, or the token was revoked. Log in again.
- **`too many attempts` (429):** wait 15 minutes, or restart the server to clear the limit.
- **`invalid username or password`:** check the password, or reset it with `pnpm cli user reset-password <name>`.
- **`daily limit reached`:** the account has used its messages for today. It resets at midnight, or raise `limits.dailyMessages`.
- **`415 Unsupported Media Type`:** a POST request is missing its `Content-Type`. Add `-ContentType "application/json"` with a body such as `'{}'`.
- **Blank page on the dev server:** make sure `apps\web\src\main.tsx` exists.
- **Phone can't connect:** use the PC's Wi-Fi address, and allow Node.js through Windows Firewall on private networks.
- **Model errors:** check the provider's `baseUrl`, and confirm the model id appears in `pnpm cli models`.
- **Missing dependencies:** run `pnpm install` from the project root.

## Project structure

```
akeru/
├─ apps/
│  ├─ server/     Fastify API, login, sessions, serves the web app
│  │  └─ scripts/e2e.ts   end-to-end checks
│  ├─ web/        React + Vite web app (login, characters, chat)
│  └─ cli/        Terminal commands and terminal UI (Ink)
├─ packages/
│  └─ core/       Database, accounts, sign-up, sessions, visibility, limits, providers
├─ config/        settings.example.json (template), settings.json, secrets.json, chars.db
└─ LIS.md         task list
```

## Status

Working: accounts, open sign-up, sessions, visibility rules, daily limits, the server API, the web login, character list, and chat, the terminal UI, and the CLI.

Not yet in the web app: creating, editing, and deleting characters, changing passwords, and the admin panel.