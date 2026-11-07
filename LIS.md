# Akeru To-Do List

## Done

### Foundation
- [x] Monorepo setup (pnpm workspace: core, server, web, cli)
- [x] SQLite data layer: characters, chats, messages, cascade delete
- [x] Schema migrations with a version number (`PRAGMA user_version`)
- [x] OpenAI-compatible provider adapter
- [x] Model listing from all providers
- [x] Provider config and secrets loading

### Chat
- [x] Shared send function (`sendChatMessage`) used by server, CLI, and UI
- [x] Persona built from character and account profile
- [x] Failed sends save nothing, so no duplicate messages
- [x] Context limit (`historyLimit`, default 40), set in settings and with `/context`
- [x] Temperature and max tokens (`/temp`, `/max`)

### Accounts and access
- [x] User accounts with admin and user roles
- [x] Passwords stored as salted scrypt hashes
- [x] First admin claims existing characters and chats
- [x] Display name and persona per account
- [x] Disable and enable accounts; the last enabled admin cannot be disabled
- [x] Password reset from the CLI
- [x] Character visibility: public or private, owner and admin rules
- [x] Chats private to their owner, including from the admin
- [x] Changing a character to private cuts off other users' chats

### Sessions and login
- [x] Login returns a token; only its hash is stored
- [x] Sessions expire after 30 days
- [x] Logout ends the session
- [x] Disabling an account blocks its existing sessions
- [x] Every `/api` route except health and login requires a token
- [x] Login lockout: 5 failures per account, 20 per IP, 15 minutes
- [x] Admin can list sessions and revoke all of a user's devices (CLI)

### Server
- [x] Fastify server with settings-driven host and port
- [x] Character, chat, message, and model routes
- [x] Production build served from the server on port 3000
- [x] Error codes: 401 not logged in, 403 not allowed, 404 not found, 429 locked out, 502 model failed

### Terminal UI and CLI
- [x] CLI commands: characters, chats, models, chat, ui, and user accounts
- [x] Global `--user` flag runs any command as a specific account
- [x] Terminal UI: character sidebar, chat, info panel
- [x] Terminal UI: Tab focus, Ctrl+N new chat, Ctrl+R retry, /model
- [x] Terminal UI: your message shows immediately, reply follows
- [x] Terminal UI: PageUp/PageDown scrolling, input box grows with text
- [x] Terminal UI: names and timestamps show reliably
- [x] Terminal UI: shows which account is running it

### Testing
- [x] Unit tests: 20 passing (database, accounts, passwords, visibility, sessions, limits)
- [x] End-to-end script: 21 checks against the running server, with self-cleanup

## Next

- [ ] Web login screen: stores the token, shows errors, returns to login on 401
- [ ] Web app sends the token on every request
- [ ] Web character list, editor, and chat screens using the visibility rules
- [ ] Web chat: pending message, scrolling, retry, temperature and max tokens
- [ ] Web logout button
- [ ] Admin panel in the web app: list users and sessions (admin only)
- [ ] Settings screen: port, database path, providers
- [ ] Per-character model, temperature, and max tokens
- [ ] Past chats listed under each character in the sidebar
- [ ] Create and edit characters inside the terminal UI (Ctrl+E)
- [ ] Delete a character inside the terminal UI
- [ ] Model list: group by provider prefix, add search
- [ ] Cache `/api/models` (currently about 2.5 seconds per call)
- [ ] Remove the unused `user` block from `config/settings.json` (chats use account profiles now)
- [ ] Avatar upload per character

## Later

- [ ] Summary memory for long chats (condense old messages instead of dropping them)
- [ ] Per-character user profiles (present differently to each character)
- [ ] Mouse wheel scrolling in the terminal UI
- [ ] Native provider adapters for Anthropic and Google (non-OpenAI format)
- [ ] OpenCode provider entry (waiting on endpoint details)
- [ ] Character import and export
- [ ] Full CLI parity with the UI (settings, retry, scrolling)
- [ ] HTTPS, or Tailscale-only access, for use outside the home network
- [ ] Standalone server build (no Node install needed)
- [ ] Tauri desktop app (wraps the web UI, starts the server)
- [ ] Linux and macOS testing
- [ ] Separate database files per profile

## Known issues

- The web interface can't reach the protected API yet. Use the CLI or terminal UI until the login screen is built.
- Passwords travel unencrypted over plain HTTP. Acceptable on a trusted home network only.
- The login limiter lives in memory, so restarting the server clears any lock.
- The admin can delete any character, including ones with active chats from other users. Those users lose the chat history.
- Anyone with access to the server PC can open `config\chars.db` directly and read everything. The app's rules don't protect against that.
- `/api/models` is slow because it fetches from every provider on each call.
- The dev proxy in `apps/web/vite.config.ts` hardcodes port 3000.
- Models sometimes refuse or drift out of character. Persona prompt tuning is ongoing.
