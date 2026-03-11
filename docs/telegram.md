# Telegram Integration

Stasis includes a private Telegram Bot integration that turns your phone into a remote control for your PC. You can receive boot notifications, pull activity logs, take screenshots, and even lock or shut down your machine — all through Telegram.

---

## How it works

Stasis uses **Telegram Bot long-polling** — it continuously asks Telegram's servers if any new commands have arrived. This means:

- No inbound ports need to be opened on your router.
- The bot works behind NAT, corporate firewalls, and VPNs.
- Only your specific `chat_id` can issue commands.

---

## Setup

### Step 1: Create a bot

1. Open Telegram and search for **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot` and follow the prompts.
3. Copy the **Bot Token** (looks like `1234567890:ABCDEFGHIJKLMNopqrstuvwxyz12345678`).

### Step 2: Find your Chat ID

1. Send any message to **[@userinfobot](https://t.me/userinfobot)**.
2. It replies with your numeric **Chat ID** (e.g., `987654321`).

### Step 3: Configure in Stasis

1. Open Stasis and go to **Settings** (gear icon, top-right).
2. Scroll to **Telegram Integration**.
3. Enter your **Bot Token** and **Chat ID**.
4. Click **Validate** to verify the token with Telegram's API.
5. Click **Enable** to start the service.

Stasis immediately encrypts both values with Fernet and stores them in the local SQLite database. The bot starts polling within a few seconds.

---

## Commands reference

| Command | Description | Confirmation required |
|---|---|---|
| `/ping` | Check if the system is online; returns current uptime | No |
| `/screenshot` | Capture the current screen and send it as an image | No |
| `/camera` | Capture a single webcam frame and send it | No |
| `/video [seconds]` | Record a webcam video clip (default: 10 s, max: 60 s) | No |
| `/lock` | Lock the Windows session (equivalent to Win+L) | No |
| `/log` | Send today's activity summary as a formatted message | No |
| `/shutdown` | Shut down the PC | **Yes** |
| `/restart` | Restart the PC | **Yes** |

### Confirmation flow

For destructive commands (`/shutdown`, `/restart`), Stasis sends a confirmation prompt to your Telegram chat:

```
⚠️ You are about to SHUTDOWN this PC.
Reply "yes" within 30 seconds to confirm.
```

If you reply `yes` within 30 seconds, the action proceeds. Any other reply (or no reply) cancels it safely.

---

## Service states

The Telegram service is a separate thread managed by `AppController`. You can view its state in **Settings → Telegram Status**.

| State | Meaning |
|---|---|
| `running` | Bot is actively polling and will respond to commands. |
| `paused` | Service was manually stopped from the UI. Credentials are preserved. |
| `degraded` | Service crashed or lost network connectivity. Stasis will attempt to reconnect. |
| `disabled` | No credentials have been configured. |

---

## Credential security

- **Encrypted at rest:** The bot token and chat ID are encrypted with Fernet symmetric encryption (AES-128-CBC for confidentiality, HMAC-SHA256 for authentication) before being written to `settings` table.
- **Local only:** The encryption key lives at `%LOCALAPPDATA%\Stasis\secret.key`. It is never transmitted anywhere.
- **Masked in UI:** The Settings page shows masked versions of the credentials (e.g., `123456:ABC***`) — the full values are never displayed after initial entry.
- **One chat ID:** Stasis only responds to the single `chat_id` you configure. Messages from other users are silently ignored.

---

## Managing the service

### Disable (keep credentials)

Click **Disable** in Settings → Telegram. The bot stops polling but credentials remain in the database. Click **Enable** (with no body) to restart it using the stored credentials.

### Restart

Click **Restart** to stop and immediately restart the polling service. Useful if the connection has degraded.

### Reset (wipe credentials)

Click **Reset** in Settings → Telegram. This permanently deletes the encrypted token and chat ID from the database. You will need to re-enter them to use Telegram again.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| State shows `degraded` | No internet connection | Stasis will auto-retry; check your network. |
| Commands are received but nothing happens | App is in `paused` state | Click **Enable** in Settings. |
| `/screenshot` returns nothing | Backend process doesn't have screen capture permission | Run as the logged-in user (not as SYSTEM). |
| Bot token validation fails | Typo in token, or bot was deleted via BotFather | Re-create the bot and update the token. |
| Correct commands are ignored | Wrong `chat_id` configured | Your chat ID must match exactly — re-check with @userinfobot. |
