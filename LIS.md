# Akeru To-Do List

## Done

### Foundation
- [x] Monorepo setup (pnpm workspace: core, server, web, cli)
- [x] SQLite data layer: characters, chats, messages, cascade delete
- [x] Schema migrations with a version number (`PRAGMA user_version`), currently version 8
- [x] OpenAI-compatible provider adapter
- [x] Model listing from all providers
- [x] Provider config and secrets loading
- [x] Settings template (`settings.example.json`), live file ignored by Git
- [x] Live config and database journal files kept out of the repo
- [x] Database backup script (`backup-akeru.ps1`) and documented restore steps

### Characters
- [x] Name, description, personality, greeting
- [x] Definition field: background, appearance, goals, and example dialogue (up to 32000 characters)
- [x] Tags and genre: up to 10, shown on cards, searchable
- [x] Length limits: description 1000, personality 32000, greeting 5000, definition 32000
- [x] Placeholders `{{char}}` and `{{user}}` in greetings and character text
- [x] Create, edit, and delete characters in the web app
- [x] Delete is inside the edit form, with a confirmation, for owners only

### Accounts and profile
- [x] User accounts with admin and user roles
- [x] Passwords stored as salted scrypt hashes
- [x] First admin claims existing characters and chats
- [x] Display name and persona per account (persona used in the chat prompt)
- [x] Disable and enable accounts; the last enabled admin cannot be disabled
- [x] Password reset from the CLI, which forces a change at next login
- [x] Change your own password from Settings, signing out other devices
- [x] Forced password change screen after an admin reset
- [x] Email for each account (migration 7): required at signup, unique, kept private
- [x] Email shown only to its owner, and to the admin in the CLI `user list`
- [x] Login accepts username or email
- [x] Account information in Settings (username, email, role, join date), from the server
- [x] Display name and bio saved on the server from Settings (migration 8, `PATCH /api/me/profile`)
- [x] Bio is set only from Settings, not on the signup form
- [x] Open sign-up behind a setting (`auth.signup`), with reserved names and attempt limits
- [x] Character visibility: public or private, owner and admin rules
- [x] Chats private to their owner, including from the admin
- [x] Changing a character to private cuts off other users' chats

### Sessions and login
- [x] Login returns a token; only its hash is stored
- [x] Sessions expire after 30 days
- [x] Logout ends the session
- [x] Disabling an account blocks its existing sessions
- [x] Every `/api` route except health, login, sign-up, and public config requires a token
- [x] Login lockout: 5 failures per account, 20 per IP, 15 minutes
- [x] Admin can list sessions and revoke all of a user's devices (CLI)

### Generation and chat
- [x] Shared send function (`sendChatMessage`) used by server, CLI, UI, and web
- [x] Persona tells the character not to write the user's lines or actions
- [x] Failed sends save nothing, so no duplicate messages
- [x] Daily message limit per user, with usage shown in the web chat
- [x] Admins are exempt from the daily limit
- [x] Bold (`**text**`) and italic (`*text*`, `_text_`) rendering, without HTML
- [x] Past chats listed under each character in the sidebar, with titles from the first message
- [x] Rename and delete a chat from the sidebar
- [x] Deleting the last chat starts a fresh one
- [x] Edit a message (text only, no model call)
- [x] Save & resend: edit your message and write a new reply, removing the messages after it
- [x] Refresh: write a new reply to the newest assistant message
- [x] Delete a single message
- [x] Word-by-word reveal in the browser, for new replies, refresh, save & resend, and generate (no model streaming needed)
- [x] Reveal options: Instant or Smooth, with a fade on each word
- [x] Reply animation setting in Settings → Chat
- [x] Generate: the composer button adds one more message from the character after its last reply
- [x] Generate is only available when the box is empty and the character spoke last
- [x] Generate counts against the daily limit, the same as a normal reply

### Generation policy and prompt (admin)
- [x] Generation parameters set by the admin for every user, in Admin panel → Models
- [x] Parameters: context size, max reply length, temperature, top P, top K, min P, repetition and presence/frequency penalties, seed
- [x] Each parameter can be turned off, so it isn't sent to the provider
- [x] Server enforces the policy on every send, stream, refresh, edit, and generate; browser values are ignored
- [x] Read-only note in Settings → Chat for users, admin pointer for admins
- [x] Policy saved in the database (`server_settings`, migration 6)
- [x] Fallback to defaults if the saved policy can't be read
- [x] Context size shown to users under the composer
- [x] Prompt size warning, turned on or off by the admin, with the model's context window and the warning point
- [x] Prompt warning is an estimate and never blocks a message

### Maintenance
- [x] Maintenance switch saved on the server, in Admin panel → System
- [x] Maintenance switch available from the CLI: `maintenance status`, `on`, `off`
- [x] Server refuses chat writes with 503 for non-admins while it's on
- [x] Admins keep full access during maintenance
- [x] App checks the switch when logged in, then every 15 seconds
- [x] Regular users are sent to `/error?type=maintenance` while it's on, and back to Home when it ends
- [x] A refused chat write also switches to the maintenance page at once, from any action
- [x] Admins are never sent to the maintenance page
- [x] Admin panel reads the server's switch when it opens, so the switch can't show a stale value

### Lockdown and errors
- [x] Lockdown page at `/error?type=lockdown`, shown when the app can't reach the server
- [x] Detection: unreachable server, gateway errors, and proxy errors switch the app to lockdown
- [x] The lockdown page checks the server every 10 seconds, and has a **Try again** button
- [x] When the server answers, the app returns to the last page the user was on
- [x] Maintenance and lockdown pages share one look, black background

### Web app: routing
- [x] URL routes with React Router: `/home`, `/search?q=`, `/character/new`, `/character/:id`, `/character/:id/edit`, `/character/:id/:chatId`
- [x] `/` redirects to `/home`
- [x] Refresh keeps the same screen, character, and chat
- [x] Browser back and forward move between chats
- [x] Search text lives in the URL
- [x] Character not found screen for missing or private characters
- [x] Invalid chat address shows a message and opens the newest chat
- [x] `/login` and `/signup` as their own pages
- [x] Logged-out users on any page are sent to `/login?next=<page>`, and return to it after login
- [x] Logged-in users on `/login` or `/signup` are sent to `/home`
- [x] `/signup` sends to `/login` when sign-up is closed
- [x] The `next` address is checked, so it can't send users outside the app
- [x] `/error?type=maintenance` and `/error?type=lockdown` as error pages

### Web app: layout
- [x] Character-style layout: one sidebar with your name, search, Home, Create, characters, and their chats
- [x] Sidebar footer: Settings and Log out (theme switch moved into Settings)
- [x] Character panel on the right of the chat, with profile, like, share, report, description, and tags
- [x] Character profile header: avatar beside name and author
- [x] Chat header removed; New chat lives in the sidebar
- [x] Phones: chat bar with sidebar and character icons, each opening a slide-in drawer
- [x] Phones: dark area behind a drawer closes it
- [x] Light and dark themes, switched in Settings

### Web app: chat
- [x] Chat screen: greeting, your message shown right away, typing indicator
- [x] Typing indicator shows in place while refreshing a reply
- [x] Retry on failed send, with text kept in the box
- [x] Enter sends, Shift+Enter adds a line
- [x] Message tools on hover (always visible on touch screens)

### Web app: settings and admin
- [x] Settings opens as a modal over the current screen (close with ×, a tap outside, or Escape)
- [x] Settings sections: Profile, Account, Chat, Display, Advanced, and Admin (admins only)
- [x] Profile: account information (from the server) and display name and bio (saved on the server)
- [x] Account: email (read-only), change password, delete account (disabled until the backend)
- [x] Chat: template, model (set by admin), reply animation, parameters note, personas (browser-only for now)
- [x] Display: language (saved only), theme, round or square icons
- [x] Advanced: debug info, clear browser data
- [x] Admin panel: overview with a 7-day chart, accounts, plans, models (generation parameters, prompt warning, provider check), moderation (reports and blocked words), and system (access, maintenance, announcement, features, activity log)
- [x] Admin CSV export of the user list

### Web app: other
- [x] Token storage, automatic logout on an expired or revoked token
- [x] Dev proxy reads the server port from `settings.json` and targets `127.0.0.1`
- [x] Dev proxy and built app both work on phones over Tailscale

### Terminal UI and CLI
- [x] CLI commands: characters, chats, models, chat, ui, and user accounts
- [x] Global `--user` flag runs any command as a specific account
- [x] CLI `user list` shows each account's email
- [x] CLI `user add` takes an optional `--email`
- [x] CLI `maintenance status`, `on`, and `off`, for use when the web app is locked
- [x] Terminal UI: character sidebar, chat, info panel
- [x] Terminal UI: Tab focus, Ctrl+N new chat, Ctrl+R retry, /model
- [x] Terminal UI: your message shows immediately, reply follows
- [x] Terminal UI: PageUp/PageDown scrolling, input box grows with text
- [x] Terminal UI: names and timestamps show reliably
- [x] Terminal UI: shows which account is running it

### Testing
- [x] Unit tests cover accounts, emails, passwords, sign-up, visibility, sessions, limits, tags, placeholders, streaming, titles, password change, message actions, generation, and login
- [x] End-to-end script: 21 checks against the running server, with self-cleanup

### Phone access
- [x] Server and dev server listen on the network
- [x] Tailscale setup documented for phone access when the router blocks device-to-device traffic
- [x] Firewall and network profile checks documented for home Wi-Fi

## Next

### Personas (current focus)
- [ ] Persona as a selectable profile: each account keeps up to five, and one is selected as active
- [ ] Each persona has a name and its own personality text
- [ ] The active persona is sent in every chat prompt, in place of the single account persona
- [ ] Persona profile picture, optional
- [ ] If a persona has no picture, the account profile picture is used
- [ ] If the account has no picture, the initials avatar is used
- [ ] Personas saved on the server, not in the browser
- [ ] Personas list in Settings → Chat, with Select, Edit, and Delete for each
- [ ] Persona limit of five enforced on the server

### Profile picture
- [ ] Account profile picture upload, with a size and type limit
- [ ] Account picture shown in Settings → Profile and in the sidebar
- [ ] Account picture used as the fallback for personas

### Settings backend
- [ ] Display preferences saved on the server (theme, icon shape, language), so they follow the account
- [ ] Chat preferences saved on the server (reply animation and template)
- [ ] Email change with a confirmation step
- [ ] Delete account

### Account recovery (needs a mail service)
- [ ] Email verification after signup
- [ ] Password reset by email
- [ ] Choose a mail provider and sender address before starting this

### Admin (backend)
- [ ] Real accounts, real suspend and ban, real limits, plans enforced on the server
- [ ] Default model enforced on the server, so users can't switch it
- [ ] Fallback model used when the default fails
- [ ] Reports sent from the character panel and stored
- [ ] Blocked words applied to messages
- [ ] Feature switches enforced
- [ ] 7-day message counts from the database
- [ ] Sign out everyone and require password change, on the server
- [ ] Every admin action recorded in an audit log on the server
- [ ] Prompt warning settings stored with the policy, and checked against the real model where possible

### Chat: next
- [ ] Context size editable per chat, within the admin's limits (optional)
- [ ] Per-character model and parameters (saved with the character)
- [ ] Example dialogue as its own field
- [ ] Generate: a short typing pause between bubbles, so they feel like a person texting
- [ ] Generate: a limit on how many messages one character may send in a row, set by the admin

### Web: character panel
- [ ] Like count stored per character and per user
- [ ] Report sent to the server (currently a prototype)
- [ ] Share link opens the character (currently only copies the link)
- [ ] Show a character's name on the home card when it's private
- [ ] Mobile check on a real phone, including the built app and both drawers

### Web: other
- [ ] Prompt tab in the chat settings: a per-chat system prompt override
- [ ] Other tab in the chat settings: extra options
- [ ] Lockdown and maintenance pages: check them on a phone, including Tailscale

### Terminal and CLI
- [ ] `--definition` and `--tags` flags on `create` and `edit`
- [ ] Tag filter for `list`
- [ ] Streaming in the terminal UI
- [ ] The chat parameters in the terminal UI, following the admin's policy
- [ ] Create and edit characters inside the terminal UI
- [ ] CLI command to add or change a user's email

### Providers and models
- [ ] Model list: group by provider prefix, add search
- [ ] Cache `/api/models` (currently about 2.5 seconds per call)
- [ ] Remove the unused `user` block from the server code path, if any remains

### Housekeeping
- [ ] Schedule `backup-akeru.ps1` daily with Windows Task Scheduler (optional, the script works when run by hand)
- [ ] Merge the `routing` branch into `main` once the persona work is tested
- [ ] Remove unused CSS: the old `.chat-head`, `.sidebar`, `.cp-hero`, and `.maintenance` rules, if any remain
- [ ] Remove the older `packages/core/src/providers/provider.test.ts` if it duplicates the new tests
- [ ] Remove the leftover `check-table.mjs` and `check-policy.mjs` helper files from `packages/core`, if they still exist

## Optional (set aside)

- [ ] Stop button for streaming replies (cancels the reveal and saves the partial text, marked as cut off). Kept off the active list, to decide later.

## Later

- [ ] Discover page: browse public characters by tag
- [ ] Summary memory for long chats (condense old messages instead of dropping them)
- [ ] Per-character user profiles (present differently to each character)
- [ ] Mouse wheel scrolling in the terminal UI
- [ ] Native provider adapters for Anthropic and Google (non-OpenAI format)
- [ ] OpenCode provider entry (waiting on endpoint details)
- [ ] Character import and export
- [ ] Avatar upload per character
- [ ] HTTPS for use outside a private network
- [ ] Standalone server build (no Node install needed)
- [ ] Tauri desktop app (wraps the web UI, starts the server)
- [ ] Linux and macOS testing
- [ ] Separate database files per profile
- [ ] Automatic scheduled backups built into the app, instead of Windows Task Scheduler

## Open decisions

- [ ] Persona scope: one active persona for the whole account, or a choice per chat
- [ ] Profile picture size and file type limits
- [ ] Whether an email change needs confirmation by the old email, once mail is set up

## Known issues

- Passwords travel unencrypted over plain HTTP on a local network. Tailscale encrypts traffic, so use it for phones.
- The login limiter lives in memory, so restarting the server clears any lock.
- The admin can delete any character, including ones with active chats from other users. Those users lose the chat history.
- Anyone with access to the server PC can open `config\chars.db` directly and read everything.
- Open sign-up lets anyone who can reach the server create an account. Turn it off in `settings.json` if the server is shared beyond your household.
- Emails are not verified, and there is no password reset by email yet.
- Display name and bio are saved on the server, but the other Settings sections, personas included, save only in the browser.
- Daily limits count messages, not cost. Generate counts the same as a normal reply, but a long run of Generate presses can still use a lot of model time.
- The prompt size warning is an estimate, using about four characters per token. A model with a larger real window may still handle a prompt the warning flags.
- Long definitions and personalities can push older chat history out of small local models' context windows, without a warning from the model itself.
- Some providers ignore parameters they don't support, so a parameter turned on can cause an error for that provider.
- Save & resend removes the messages after the edited one. This is intentional, but it can't be undone.
- Models sometimes write lines for the user even with the persona rule, especially smaller ones.
- The maintenance page depends on the app being open: a user who keeps a chat open is switched within 15 seconds, not instantly.
- Lockdown detection depends on the failed request's response. If the dev proxy returns an unusual error, the page may not appear until the next request.
- The admin panel's accounts list, plans, and moderation tools are prototype data in the browser, and clearing browser data resets them.
- `/api/models` is slow because it fetches from every provider on each call.
- Sign-up and login attempts are limited per IP, so people behind the same router share one limit.
- Models sometimes refuse or drift out of character. Persona prompt tuning is ongoing.
- Greetings already saved in older chats keep their `{{user}}` text, since placeholders are filled only when a chat starts.
- The character panel's icon for the chat bar on phones is a placeholder flag icon.
- Some `500` errors after editing server files only clear with a server restart. Restart the server after any change under `apps\server` or `packages\core`.
