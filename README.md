# Akeru

A local, self-hosted character chat app, similar to Character.AI. Run it on your own PC, create characters, and chat with them using local models (llama.cpp, Ollama, LM Studio) or API providers (9router, and any other OpenAI-compatible endpoint). Multiple user accounts can share one server, each with private chats and their own profile.

## Features

- **Characters** with name, description, personality, and greeting. Each character gets its own persona in every request.
- **Accounts:** an admin plus regular users, each with a username and password. Passwords are stored as salted hashes.
- **Visibility:** characters are public (everyone can chat) or private (only the owner can chat; the admin can see that it exists).
- **Private chats:** each chat belongs to one user. Nobody else can read it, including the admin.
- **Sessions:** logging in gives each device its own token. Admins can see and revoke sessions.
- **Login protection:** repeated failed logins lock the account or IP for 15 minutes.
- **Model switching:** pick any model from any configured provider, as `provider/model`.
- **Chat settings:** temperature, max tokens, and how much history the model sees (default 40 messages).
- **Terminal UI:** a three-panel interface with scrolling, retry, and live message display.
- **CLI:** manage characters, accounts, sessions, and chats from the terminal.
- **Web UI and server:** a React interface served by the Fastify server, reachable from other devices on your network.

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

The database file (`config\chars.db`) is created the first time the server or CLI runs. Any characters and chats that existed before accounts were added belong to the first admin.

## Configuration

Settings live in `config\`:

- `settings.json`: server, database, and chat defaults, plus providers. Safe to commit.
- `secrets.json`: API keys, keyed by provider id. Never committed.
- `chars.db`: the SQLite database. Never committed.

Example `settings.json`:

```json
{
  "server": { "host": "0.0.0.0", "port": 3000 },
  "database": { "path": "config/chars.db" },
  "chat": { "historyLimit": 40 },
  "providers": [
    { "id": "9router", "baseUrl": "http://localhost:20128/v1", "models": [] },
    { "id": "llamacpp", "baseUrl": "http://localhost:8080/v1", "models": [] }
  ]
}
```

- **`server.port`** sets the port. Change it if another program uses 3000, and restart the server.
- **`server.host`** `0.0.0.0` lets other devices connect. `127.0.0.1` allows only this PC.
- **`database.path`** sets the database file. Use a different file for each separate instance.
- **`chat.historyLimit`** is how many past messages the model sees. Older messages stay in the database and on screen.

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
| Create, list, disable, and reset users | Yes (CLI, on the server PC) | No |
| See and revoke sessions | Yes | Own sessions only |
| Edit providers and settings | Yes | No |
| See public characters | Yes | Yes |
| See private characters | Yes, with the owner's name | Own only |
| Chat with a public character | Yes | Yes |
| Chat with a private character | Own only | Own only |
| Read another user's chat | No | No |
| Edit a character | Owner only | Owner only |
| Delete a character | Owner, or admin | Owner only |

Admins manage accounts from the CLI on the server PC, so no web admin login is needed for that.

## Character visibility

- **Public:** every user can see and chat with it.
- **Private:** only the owner can chat with it. The admin can see it and who created it, but cannot chat with it.
- Changing a character from public to private cuts off existing chats with users who don't own it. Those chats stop accepting messages, but the history stays in the database.

## API

Every route except the two listed as public requires a login token. Send it as `Authorization: Bearer <token>`.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Server and database status |
| POST | `/api/login` | Public | Log in, returns a token |
| POST | `/api/logout` | Logged in | End the current session |
| GET | `/api/me` | Logged in | The current account |
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

## Tests

Unit tests cover the database, accounts, passwords, visibility rules, sessions, and login limits:

```powershell
cd packages\core
pnpm test
```

Expect 20 passing tests.

End-to-end checks run against a running server. They log in as both accounts, test visibility, permissions, chat privacy, failed sends, and logout, then remove their own test characters. They never call a model.

```powershell
cd apps\server
pnpm start
```

In a second window:

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
- **`duplicate column name` on startup:** the migration list was edited out of order. Keep the original migrations in place, and add new ones only at the end.
- **`login required` (401):** the request has no token, or the token was revoked. Log in again.
- **`too many attempts` (429):** wait 15 minutes, or restart the server to clear the limit.
- **`invalid username or password`:** check the password, or reset it with `pnpm cli user reset-password <name>`.
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
│  ├─ web/        React + Vite interface (login screen in progress)
│  └─ cli/        Terminal commands and terminal UI (Ink)
├─ packages/
│  └─ core/       Database, accounts, sessions, visibility rules, providers
├─ config/        settings.json, secrets.json, chars.db
└─ LIS.md         task list
```

## Status

Working: accounts, sessions, visibility rules, the server API, the terminal UI, and the CLI.

In progress: the web login screen. Until it's built, the web interface can't reach the protected API. Use the CLI or the terminal UI for now.
