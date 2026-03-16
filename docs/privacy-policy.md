# Stasis Privacy Policy

Last updated: March 16, 2026

This Privacy Policy explains what Stasis collects, where it is stored, when data leaves your device, and how you can control or delete it.

## 1. Summary

Stasis is designed to work primarily on-device. Most data is stored locally in a SQLite database on your Windows PC.

Data leaves your device only when you enable or use internet features such as Telegram remote control and update checks.

## 2. Data We Collect

Depending on enabled settings and how you use the app, Stasis may collect:

### A) Activity and productivity data (local)

- App/process name (for example: `code.exe`)
- Executable path
- Process ID
- Window title
- Active time and idle time
- Mouse click count
- Keystroke count (count only, not key content)
- Browser URL for supported browsers when browser tracking is enabled

### B) Analytics and settings data (local)

- Daily stats and category summaries
- App limits and blocked-app status
- Feature toggles and preferences
- Data retention configuration

### C) Optional file activity data (local, only if enabled)

- File event type (`created`, `modified`, `deleted`, `moved`)
- File path

### D) Optional Telegram integration data

- Bot token and chat ID (stored encrypted at rest)
- Recent bot command history (last commands metadata)
- Media generated on demand by your command (for example screenshot/webcam capture) before upload to Telegram

### E) Local application logs

- Diagnostic logs for reliability and troubleshooting

## 3. What We Do Not Intentionally Collect

Stasis does not intentionally collect or transmit:

- Passwords
- Keystroke content (only aggregate counts are recorded)
- File contents (only file event metadata/path if file logging is enabled)

## 4. How We Use Data

We use collected data to:

- Show screen-time and focus analytics
- Enforce app limits and blocking rules
- Run requested remote actions through Telegram (if enabled)
- Provide diagnostics and improve reliability

## 5. When Data Leaves Your Device

Stasis may make network requests in these cases:

### A) Telegram integration (optional, user-enabled)

- Calls Telegram Bot API to validate token, poll commands, and send requested messages/media/files.
- Data sent depends on commands you use (for example status text, screenshot, webcam image/video, selected logs).

### B) Update checks and updates

- Checks latest release metadata from GitHub API.
- Downloads installer/update package from GitHub release assets when you choose to update.

### C) Connectivity checks

- May perform a basic internet reachability check.

Outside of these scenarios, Stasis is intended to run locally without sending analytics or advertising telemetry.

## 6. Data Storage and Retention

- Primary storage: local SQLite database on your device.
- Credentials: Telegram bot token/chat ID are encrypted before storage.
- Retention: you can configure automatic deletion (retention days) or keep data until you clear it.
- Manual deletion: you can clear activity data/reset from app settings and can uninstall the app.

## 7. Data Sharing

Stasis does not sell your personal data.

Stasis does not share your data with third parties for advertising purposes.

Data is shared with service providers only when required for features you enable, such as Telegram (for bot messaging) and GitHub (for update checks/downloads).

## 8. Security

We use reasonable technical measures, including local credential encryption for Telegram secrets and local-only backend binding for app control endpoints.

No method of storage or transmission is 100% secure.

## 9. Your Choices and Controls

You can:

- Disable browser tracking
- Disable file logging
- Disable Telegram integration
- Adjust retention duration
- Clear data from the app
- Uninstall Stasis

## 10. Children's Privacy

Stasis is not directed to children under 13. If you believe data from a child was collected unintentionally, contact us to request removal support.

## 11. International Data Transfers

If you use Telegram or GitHub update services, related data may be processed on servers outside your country according to those providers' infrastructure and policies.

## 12. Changes to This Policy

We may update this Privacy Policy. We will update the "Last updated" date when changes are made.

## 13. Contact

For privacy questions or requests, contact:

- GitHub Issues: https://github.com/arshsisodiya/Stasis/issues
- Repository: https://github.com/arshsisodiya/Stasis

You can also review this policy inside the app at **Settings → About & Privacy → Privacy**.

If you do not agree with this Privacy Policy, do not use the software.

