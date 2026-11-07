# Akeru To-Do List

## Done

### Foundation
- [x] Monorepo setup (pnpm workspace: core, server, web, cli)
- [x] SQLite data layer: characters, chats, messages, cascade delete
- [x] Schema migrations with a version number (`PRAGMA user_version`), currently version 3
- [x] OpenAI-compatible provider adapter
- [x] Model listing from all providers
- [x] Provider config and secrets loading
- [x] Settings template (`settings.example.json`), live file ignored by Git
- [x] Live config and database journal files kept out of the repo

### Characters
- [x] Name, description, personality, greeting
- [x] Definition field: background, appearance, goals, and example dialogue (up to 32000 characters)
- [x] Tags and genre: up to 10, shown on cards, searchable
- [x] Length limits: description 1000, personality 32000, greeting 5000, definition 32000
- [x] Placeholders `{{char}}` and `{{user}}` in greetings and character text, filled in when the chat starts and in each prompt

### Chat
- [x] Shared send function (`sendChatMessage`) used by server, CLI, UI, and web
- [x] Persona built from character fields and account profile
- [x] Failed sends save nothing, so no duplicate messages
- [x] Context limit (`historyLimit`, default 40), set in settings and with `/context`
- [x] Temperature and max tokens (terminal `/temp`, `/max`; web settings panel)
- [x] Daily message limit per user, with usage shown in the web chat
- [x] Admins are exempt from the daily limit
- [x] Streaming replies word by word in the web chat, with a fallback for providers that don't stream
- [x] Bold (`**text**`) and italic (`*text*`, `_text_`) rendering in messages, without HTML

### Accounts and access
- [x] User accounts with admin and user roles
- [x] Passwords stored as salted scrypt hashes
- [x] First admin claims existing characters and chats
- [x] Display name and persona per account
- [x] Disable and enable accounts; the last enabled admin cannot be disabled
- [x] Password reset from the CLI
- [x] Open sign-up behind a setting (`auth.signup`), with reserved names and attempt limits
- [x] Character visibility: public or private, owner and admin rules
- [x] Chats private to their owner, including from the admin
- [x] Changing a character to private cuts off other users' chats

### Sessions and login
- [x] Login returns a token; only its hash is stored
- [x] Sessions expire after 30 days
- [x] Logout ends the session
- [x] Disabling an account blocks its existing sessions
- [x] Every `/api` route except health, login, and sign-up requires a token
- [x] Login lockout: 5 failures per account, 20 per IP, 15 minutes
- [x] Admin can list sessions and revoke all of a user's devices (CLI)

### Server
- [x] Fastify server with settings-driven host and port
- [x] Character, chat, message, stream, model, and sign-up routes
- [x] Production build served from the server on port 3000
- [x] Error codes: 401 not logged in, 403 not allowed, 404 not found, 409 name taken, 429 locked out or daily limit, 502 model failed

### Web app
- [x] Token storage, automatic logout on an expired or revoked token
- [x] Login screen, with sign-up when it's open
- [x] Character-style layout: sidebar, character cards, chat with names and avatars
- [x] Create, edit, and delete characters, with a confirmation before delete
- [x] Edit and delete shown only to the owner (and delete to admin)
- [x] Logout button (this device only)
- [x] Character list with search, including tags
- [x] Chat screen: greeting, your message shown right away, typing indicator, streaming
- [x] Chat settings: model, temperature, max tokens (saved in the browser)
- [x] Retry on failed send, with text kept in the box
- [x] Enter sends, Shift+Enter adds a line
- [x] Dev proxy reads the server port from `settings.json`
- [x] Works on phones: the sidebar becomes a top bar on narrow screens

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
- [x] Unit tests: 27 passing (database, accounts, passwords, sign-up, visibility, sessions, limits, tags, placeholders, streaming, login)
- [x] End-to-end script: 21 checks against the running server, with self-cleanup

### Phone access
- [x] Server and dev server listen on the network
- [x] Tailscale setup documented for phone access when the router blocks device-to-device traffic

## Next

### Web
- [ ] Change your own password (needed now that sign-up is open)
- [ ] Admin panel, admin only: list users and sessions, disable and enable accounts, revoke sessions
- [ ] Stop button for streaming replies (cancels the request and keeps the partial text)
- [ ] Past chats listed under each character, with titles
- [ ] Show a character's name on the home card when it's private
- [ ] Mobile check on a real phone through Tailscale, including the built app

### Characters and chat
- [ ] Prompt size warning when definition and personality are large for the chosen model
- [ ] Example dialogue as its own field
- [ ] Per-character model, temperature, and max tokens
- [ ] Delete a chat from the chat screen
- [ ] Back up `config\chars.db` on a schedule (script or documented steps)

### Terminal and CLI
- [ ] `--definition` and `--tags` flags on `create` and `edit`
- [ ] Tag filter for `list`
- [ ] Streaming in the terminal UI
- [ ] Create and edit characters inside the terminal UI

### Providers and models
- [ ] Model list: group by provider prefix, add search
- [ ] Cache `/api/models` (currently about 2.5 seconds per call)
- [ ] Remove the unused `user` block from the server code path, if any remains

### Housekeeping
- [ ] Update README with definition, tags, placeholders, streaming, markdown, and the Tailscale phone setup
- [ ] Remove the older `packages/core/src/providers/provider.test.ts` if it duplicates the new tests

## Later

- [ ] Summary memory for long chats (condense old messages instead of dropping them)
- [ ] Per-character user profiles (present differently to each character)
- [ ] Mouse wheel scrolling in the terminal UI
- [ ] Native provider adapters for Anthropic and Google (non-OpenAI format)
- [ ] OpenCode provider entry (waiting on endpoint details)
- [ ] Character import and export
- [ ] Avatar upload per character
- [ ] Discover page: browse public characters by tag
- [ ] HTTPS for use outside a private network
- [ ] Standalone server build (no Node install needed)
- [ ] Tauri desktop app (wraps the web UI, starts the server)
- [ ] Linux and macOS testing
- [ ] Separate database files per profile

## Known issues

- Passwords travel unencrypted over plain HTTP on a local network. Tailscale encrypts traffic, so use it for phones.
- The login limiter lives in memory, so restarting the server clears any lock.
- The admin can delete any character, including ones with active chats from other users. Those users lose the chat history.
- Anyone with access to the server PC can open `config\chars.db` directly and read everything.
- Open sign-up lets anyone who can reach the server create an account. Turn it off in `settings.json` if the server is shared beyond your household.
- Daily limits count messages, not cost.
- Long definitions and personalities can push older chat history out of small local models' context windows, without a warning.
- Some providers ignore streaming and send the whole reply at once, so words won't appear one by one with them.
- `/api/models` is slow because it fetches from every provider on each call.
- Sign-up and login attempts are limited per IP, so people behind the same router share one limit.
- Models sometimes refuse or drift out of character. Persona prompt tuning is ongoing.
- Chat settings in the web app are saved per browser, not per account.
- Greetings already saved in older chats keep their `{{user}}` text, since placeholders are filled only when a chat starts.
