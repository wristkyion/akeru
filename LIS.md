# Akeru To-Do List

## Done

### Foundation
- [x] Monorepo setup (pnpm workspace: core, server, web, cli)
- [x] SQLite data layer: characters, chats, messages, cascade delete
- [x] Schema migrations with a version number (`PRAGMA user_version`), currently version 10
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
- [x] Character picture: uploaded on the character form (owner only), shown on cards, in the panel, and in chat bubbles

### Accounts and profile
- [x] User accounts with admin and user roles
- [x] Passwords stored as salted scrypt hashes
- [x] First admin claims existing characters and chats
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
- [x] Account picture (migration 10): uploaded in Settings → Profile, shown in the sidebar, Settings, chat bubbles, and cards
- [x] Account and character pictures visible to anyone who can see the account or character
- [x] Open sign-up behind a setting (`auth.signup`), with reserved names and attempt limits
- [x] Character visibility: public or private, owner and admin rules
- [x] Chats private to their owner, including from the admin
- [x] Changing a character to private cuts off other users' chats

### Pictures
- [x] Pictures stored in `config\pictures\` as encrypted files (AES-256-GCM), with random names and no extension
- [x] Encryption key in `config\picture.key`, created on first start
- [x] Upload checks: JPEG, PNG, or WebP only, checked by file contents, up to 2 MB, no resizing
- [x] Database stores only picture ids (migration 10, `pictures` table)
- [x] Pictures served only after an access check; files are decrypted only on request
- [x] Replacing or removing a picture deletes the old file
- [x] Shared `Avatar` component: picture if there is one, otherwise initials, everywhere
- [x] Persona picture: uploaded in Settings → Chat, shown in the persona list, and used for the selected persona's bubbles in chat
- [x] Picture tests: round trip, no readable file on disk, refused non-images, size limit, tamper check, access rules

### Personas
- [x] Personas table (migration 9): up to five per account, with one selected at a time, enforced by the database
- [x] Personas are optional: with none selected, the account's name and bio are used
- [x] Creating the first persona selects it automatically
- [x] Deleting the selected persona selects the oldest remaining one
- [x] A persona can be unselected, even when it's the only one
- [x] Core rules: create, edit, select, unselect, delete, and list, with the five-persona limit checked in core
- [x] Only the owner can change a persona
- [x] Routes: `GET`, `POST`, `PUT`, `DELETE /api/personas`, and `POST /api/personas/:id/select` and `/unselect`
- [x] Selected persona's personality is used in every chat prompt: send, stream, refresh, edit with resend, and generate
- [x] Selected persona's name is used as the name the character calls you, in prompts and in new chat greetings
- [x] Prompt tells the character to use the name it is given, even over earlier messages in the chat
- [x] Settings → Chat list with Select, Unselect, Edit, Delete, and Picture, saved on the server
- [x] Core and route tests for personas, plus a PowerShell test guide

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
- [x] Multi-bubble replies from one request are shown as separate bubbles

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
- [x] Login form checks the email only at sign-up

### Web app: layout
- [x] Character-style layout: one sidebar with your name, search, Home, Create, characters, and their chats
- [x] Sidebar footer: Settings and Log out
- [x] Character panel on the right of the chat, with profile, like, share, report, description, and tags
- [x] Character profile header: avatar beside name and author
- [x] Chat header removed; New chat lives in the sidebar
- [x] Phones: chat bar with sidebar and character icons, each opening a slide-in drawer
- [x] Phones: dark area behind a drawer closes it

### Web app: chat
- [x] Chat screen: greeting, your message shown right away, typing indicator
- [x] Typing indicator shows in place while refreshing a reply
- [x] Retry on failed send, with text kept in the box
- [x] Enter sends, Shift+Enter adds a line
- [x] Message tools on hover (always visible on touch screens)

### Web app: settings and admin
- [x] Settings opens as a modal over the current screen (close with ×, a tap outside, or Escape)
- [x] Settings sections: Profile, Account, Chat, Display, Advanced, and Admin (admins only)
- [x] Profile: account information (from the server), account picture, and display name and bio (saved on the server)
- [x] Account: email (read-only), change password
- [x] Chat: model (set by admin), reply animation, parameters note, personas (saved on the server)
- [x] Display: language, theme, round or square icons (saved in the browser for now)
- [x] Advanced: debug info, clear browser data (saved in the browser for now)
- [x] Admin panel: overview with a 7-day chart, accounts, plans, models (generation parameters, prompt warning, provider check), moderation (reports and blocked words), and system (access, maintenance, announcement, features, activity log)
- [x] Admin panel reads maintenance from the server when it opens
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
- [x] Unit tests: 58 passing, covering accounts, emails, passwords, sign-up, visibility, sessions, limits, tags, placeholders, streaming, titles, password change, message actions, generation, personas, pictures, and login
- [x] End-to-end script: 21 checks against the running server, with self-cleanup

### Phone access
- [x] Server and dev server listen on the network
- [x] Tailscale setup documented for phone access when the router blocks device-to-device traffic
- [x] Firewall and network profile checks documented for home Wi-Fi

## Next

### Settings: Account tab
- [ ] Delete account: the user confirms with their password, their chats, personas, and pictures are removed, and the admin's characters with other users' chats are handled by a rule (see open decisions)

### Settings: Chat tab
- [ ] Remove the template setting
- [ ] Hide the model selection from users; admins still set the model in Admin panel → Models
- [ ] Hide the parameters from users; show them to admins only, in Settings → Chat
- [ ] Reply animation and personas stay for all users

### Settings: Display tab
- [ ] Language: English, Indonesian, Simplified Chinese, and Japanese, saved on the server
- [ ] Theme: Auto (follows the device), Dark, and Light, saved on the server
- [ ] Remove the round or square icon setting
- [ ] Display preferences follow the account to every device

### Settings: Advanced tab (proposed, to confirm)
- [ ] Choose which Advanced items to keep: debug info, export chats, clear browser data, sessions list
- [ ] Sessions list with "sign out other devices"
- [ ] Export chats as JSON (currently disabled)
- [ ] Debug info shown to admins only

### Settings backend
- [ ] Chat preferences saved on the server (reply animation)
- [ ] Email change with a confirmation step

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
- [ ] Prompt warning settings checked against the real model where possible

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
- [ ] CLI command to manage personas

### Providers and models
- [ ] Model list: group by provider prefix, add search
- [ ] Cache `/api/models` (currently about 2.5 seconds per call)
- [ ] Remove the unused `user` block from the server code path, if any remains

### Housekeeping
- [ ] Reorganize folders: group `apps/web/src` into `pages`, `components`, and `lib`, and `packages/core/src` into `accounts`, `chat`, `providers`, and `settings`. Do this as one separate step, after the features are done, using `git mv` and updating imports together.
- [ ] Schedule `backup-akeru.ps1` daily with Windows Task Scheduler (optional, the script works when run by hand)
- [ ] Back up `config\picture.key` and `config\pictures\` together with `chars.db`
- [ ] Remove unused CSS: the old `.chat-head`, `.sidebar`, `.cp-hero`, `.maintenance`, and `.cp-btn` rules, if any remain
- [ ] Remove the older `packages/core/src/providers/provider.test.ts` if it duplicates the new tests
- [ ] Remove the leftover `check-table.mjs` and `check-policy.mjs` helper files from `packages/core`, if they still exist

## Optional (set aside)

- [ ] Stop button for streaming replies (cancels the reveal and saves the partial text, marked as cut off). Kept off the active list, to decide later.
- [ ] Picture resizing on upload (decided against for now; 2 MB limit kept)

## Later

- [ ] Discover page: browse public characters by tag
- [ ] Summary memory for long chats (condense old messages instead of dropping them)
- [ ] Per-character user profiles (present differently to each character)
- [ ] Mouse wheel scrolling in the terminal UI
- [ ] Native provider adapters for Anthropic and Google (non-OpenAI format)
- [ ] OpenCode provider entry (waiting on endpoint details)
- [ ] Character import and export
- [ ] Avatar upload per character (done for characters; see Pictures)
- [ ] HTTPS for use outside a private network
- [ ] Standalone server build (no Node install needed)
- [ ] Tauri desktop app (wraps the web UI, starts the server)
- [ ] Linux and macOS testing
- [ ] Separate database files per profile
- [ ] Automatic scheduled backups built into the app, instead of Windows Task Scheduler

## Open decisions

- [ ] Delete account: what happens to the admin's characters that other users have chats with (keep them, or block deletion until the admin reassigns or removes them)
- [ ] Advanced tab: which items to keep (see Settings: Advanced tab)
- [ ] Display: whether the Auto theme follows the operating system only, or also the time of day
- [ ] Persona scope: one selected persona for the whole account (decided); a choice per chat (later)
- [ ] Whether an email change needs confirmation by the old email, once mail is set up

## Known issues

- Passwords travel unencrypted over plain HTTP on a local network. Tailscale encrypts traffic, so use it for phones.
- The login limiter lives in memory, so restarting the server clears any lock.
- The admin can delete any character, including ones with active chats from other users. Those users lose the chat history.
- Anyone with access to the server PC can open `config\chars.db` and `config\pictures\` directly. Pictures are encrypted, but the key file is on the same PC.
- Open sign-up lets anyone who can reach the server create an account. Turn it off in `settings.json` if the server is shared beyond your household.
- Emails are not verified, and there is no password reset by email yet.
- Display, chat template and animation, and the admin panel's prototype data save only in the browser until the server settings backend is built.
- Daily limits count messages, not cost. Generate counts the same as a normal reply, but a long run of Generate presses can still use a lot of model time.
- The prompt size warning is an estimate, using about four characters per token. A model with a larger real window may still handle a prompt the warning flags.
- Long definitions and personalities can push older chat history out of small local models' context windows, without a warning from the model itself.
- Some providers ignore parameters they don't support, so a parameter turned on can cause an error for that provider.
- Save & resend removes the messages after the edited one. This is intentional, but it can't be undone.
- Models sometimes write lines for the user even with the persona rule, especially smaller ones.
- Models may still use an old name from earlier messages in a chat. The prompt asks them to use the current name, but this is not guaranteed.
- Greetings already saved in older chats keep the name they were started with. Only new chats use the selected persona's name.
- The maintenance page depends on the app being open: a user who keeps a chat open is switched within 15 seconds, not instantly.
- Lockdown detection depends on the failed request's response. If the dev proxy returns an unusual error, the page may not appear until the next request.
- The admin panel's accounts list, plans, and moderation tools are prototype data in the browser, and clearing browser data resets them.
- `/api/models` is slow because it fetches from every provider on each call.
- Sign-up and login attempts are limited per IP, so people behind the same router share one limit.
- Models sometimes refuse or drift out of character. Persona prompt tuning is ongoing.
- The character panel's icon for the chat bar on phones is a placeholder flag icon.
- Some `500` errors after editing server files only clear with a server restart. Restart the server after any change under `apps\server` or `packages\core`.
