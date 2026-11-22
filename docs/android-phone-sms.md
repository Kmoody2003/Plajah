# Plajah Phone — default dialer + SMS app (Android)

Plajah can be the phone's **default Phone app** and **default texting app**. Calls, texts and
contacts then sit next to Plajah chats, and a person who is both a phone contact and a Plajah
member gets one entry with both kinds of actions (carrier call / text, Plajah call / DM).

Decided 2026-11-21: ship on **both** Google Play and direct APK download; **full** phone + SMS in
v1; carrier texts and call history stay **on the phone** (opt-in encrypted sync is a later step).
Third-party apps cannot use RCS directly; Plajah texting is SMS/MMS, and RCS shows through the
notification bridge below.

## What's where

| Piece | File |
|---|---|
| Role + permission requests, calls, call log, contacts CRUD, SMS read/send | `android/app/src/main/kotlin/com/plajah/app/telecom/PlajahTelecomPlugin.kt` |
| Carrier calls from Telecom (default dialer) | `telecom/PlajahInCallService.kt`, `telecom/CallRegistry.kt` |
| Incoming / ongoing call notification (full-screen, CallStyle, Answer/Decline/Hang up) | `telecom/CallNotifications.kt` |
| SMS deliver, MMS WAP push, sent status, respond-via-message | `telecom/SmsReceivers.kt` |
| Telephony provider reads/writes (threads, messages, MMS parts) | `telecom/SmsStore.kt` |
| dial / sms: / call-notification intents → `/?view=phone` | `telecom/PhoneIntents.kt` (hooked from `MainActivity.experienceFor`) |
| Manifest: permissions, `DialActivity` + `ComposeSmsActivity` aliases, service, receivers | `android/app/src/main/AndroidManifest.xml` |
| JS bridge (no-op off Android) | `services/phone/telecom.ts` |
| Number matching/formatting, T9 search; phone book × Plajah people merge | `services/phone/phoneNumber.ts`, `services/phone/contactsMerge.ts` (tests: `tests/phoneHub.test.ts`) |
| Phone UI: Keypad, Recents, Contacts (+ editor), Messages, in-call screen | `components/phone/PhoneHub.tsx` (view `PHONE_HUB`, slug `phone`) |
| Texts inside Chat ("Texts" tab + texts under "All") | `components/ChatSystem.tsx`, `components/phone/SmsViews.tsx` |

Open the hub from anywhere with `window.dispatchEvent(new CustomEvent('plajah:openPhone'))`.

## Privacy rules

- Phone book matching against Plajah people is **local**: only people the user already has DMs
  with are compared (email, then phone). The phone book is never uploaded and no server lookup by
  number happens.
- Carrier texts and the call log are read from Android's own providers and never written to
  Firestore. A future "back up my texts" toggle must be opt-in, end-to-end encrypted, and must not
  grow `firestore.rules` much (it is near its size limit — see the ops-database move notes).

## RCS via notifications (added 2026-11-21)

No third-party RCS API exists: Google Messages keeps RCS in private storage, and
`ImsRcsManager` / `SipDelegate` need carrier privilege. So Plajah mirrors RCS (and any other
conversation) from **Google Messages / Samsung Messages notifications**:

- `telecom/RcsBridge.kt`: `PlajahRcsBridgeService` (a `NotificationListenerService`, needs the
  user to turn on **Notification access**) parses `MessagingStyle` notifications into threads and
  keeps them in app-private storage (`filesDir/rcs_bridge_threads.json`, max 300 per thread).
- Replies fire the notification's own **Reply** action (`RemoteInput`). Plajah keeps only the
  latest live action per thread in memory, so replying works only while that notification is
  still showing.
- SMS that Google Messages also notifies about are skipped when Plajah can read the SMS provider
  and finds the same body within 2 minutes (no duplicates in the Texts list).
- Plugin: `rcsBridgeStatus`, `openNotificationAccessSettings`, `openDefaultAppsSettings`,
  `listRcsThreads`, `getRcsMessages`, `sendRcsReply`, `markRcsRead`, `deleteRcsThread`; event
  `rcsMessage`. UI: `components/phone/RcsViews.tsx` (blue **RCS** badge next to green **SMS**).

**The two texting modes don't mix.** Google Messages only does RCS while it is the default SMS
app. So the user picks one:

| Mode | Default SMS app | What Plajah shows |
|---|---|---|
| Plajah texting | Plajah | All SMS/MMS with full history, sending, no RCS anywhere on the phone |
| RCS bridge | Google Messages | New RCS + SMS messages mirrored from notifications, replies while live; full SMS history too if `READ_SMS` is granted (direct APK) |

The RCS setup card says this and links to Default apps and Notification access.

Limits shown in the UI: new messages only (no history), text only (media shows as a placeholder,
reactions are not mirrored), needs Notification access. Everything stays on the phone, same as SMS.

## Google Play: what must happen before a Play release

SMS and Call Log are **restricted permissions**. Play only allows them for an app that is the
user's default SMS / Phone handler and whose core function needs them. Required steps:

1. **Permissions Declaration Form** (Play Console → App content → Sensitive permissions):
   - Declare `READ_SMS`, `SEND_SMS`, `RECEIVE_SMS`, `RECEIVE_MMS` under **Default SMS handler**.
   - Declare `READ_CALL_LOG`, `WRITE_CALL_LOG` (and `CALL_PHONE`, `ANSWER_PHONE_CALLS`) under
     **Default Phone handler**.
   - Explain the core use: "Plajah is a communications app; users can set it as their default
     phone and messaging app, and calls/texts appear alongside their Plajah conversations."
2. **Demo video** for the reviewer showing the role prompt (Phone hub → *Default phone app* /
   *Default texting app*), placing and receiving a call, and sending/receiving a text.
3. **Prominent disclosure + privacy policy**: the setup card already says texts and call history
   stay on the phone; the public privacy policy must say the same, including that contacts are
   matched on-device only.
4. Plajah must **only ask for these permissions after** the user picks the role (that's how
   `becomeDefault()` in `services/phone/telecom.ts` works) — don't add an up-front prompt.
5. Data safety form: SMS, call log and contacts are accessed but **not collected** (not sent off
   the device).
6. **Notification access (RCS bridge)**: `BIND_NOTIFICATION_LISTENER_SERVICE` is not a restricted
   permission, but Play's policy requires that reading notifications serves a core, user-facing
   feature and is disclosed. Declare it in the listing and privacy policy as "shows your Google
   Messages / Samsung Messages conversations inside Plajah and lets you reply"; read only those
   two packages (the service ignores everything else); keep the data on the device; and never
   turn it on without the user enabling it in Android Settings.

If review is refused, the fallback is a Play build without the SMS/Call Log permissions (dialer
still works through Telecom; Recents/Messages hidden) while the direct APK keeps everything.
That needs a product flavor in `android/app/build.gradle` with a manifest that uses
`tools:node="remove"` on those `<uses-permission>` lines — not built yet.

## Direct APK

No Play review applies; the same build works. Users must allow installs from this source. The
role prompt and permissions still go through Android's own dialogs.

## Not in v1 (phase 2)

- **Incoming MMS download**: `MmsWapPushReceiver` currently only notifies. Downloading needs
  `SmsManager.downloadMultimediaMessage` + PDU parsing into the MMS provider. Existing MMS (and
  MMS received while another app was default) display fine.
- **Sending MMS / group texts**: sending to several addresses sends one SMS each.
- **Plajah calls in the system call UI** (self-managed `ConnectionService`, `MANAGE_OWN_CALLS`):
  would make Plajah voice/video calls ring like phone calls, work with Bluetooth/car/lock screen.
- **Blocking numbers** (`BlockedNumberContract`, available to the default dialer/SMS app),
  voicemail, call recording disclosure, dual-SIM picker in the keypad (`getSims()` exists).
- **Opt-in encrypted sync** of texts/call log to the account.

## Testing on a phone

1. Install the debug APK, open Plajah → Chat → **Texts** → *Open Phone* (or launch `?view=phone`).
2. Tap *Default phone app* and *Default texting app*; accept both system sheets.
3. Call the phone from another line: full-screen incoming notification → Answer → in-call screen
   (mute, keypad/DTMF, speaker/Bluetooth, hold, merge, hang up).
4. Dial out from the keypad; check Recents; send and receive a text from Chat's Texts tab.
5. Turn the role back to Google's apps in Settings → Apps → Default apps when done testing.
