# Security Specification: Chat System

## Data Invariants
1. A message cannot exist without a valid parent chat room.
2. A user can only read messages in a chat room if they are a participant or if the room is `PUBLIC_LIVE`.
3. A user can only send messages as themselves (senderId must match auth.uid).
4. Messages in a `PRIVATE` or `GROUP` chat are restricted to participants.
5. `PUBLIC_LIVE` chat rooms are readable by any authenticated user.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Sending a message with a different `senderId`.
2. **Room Hijacking**: Creating a room with someone else as the `ownerId`.
3. **Unauthorized Read**: Attempting to list messages in a `PRIVATE` room the user is not a part of.
4. **Metadata Overwrite**: Updating `updatedAt` field in a room the user is not a part of.
5. **Field Injection**: Sending a message with an extra `isAdmin: true` field.
6. **ID Poisoning**: Using a 1MB string as the `roomId`.
7. **Type Mismatch**: Sending `timestamp` as a string instead of a number.
8. **Malicious Enum**: Setting room `type` to `SECRET_ADMIN_ROOM`.
9. **Spam Attack**: Sending a message text that is 1MB in size.
10. **State Shortcut**: Marking a message as `seenBy` for another user.
11. **Orphaned Message**: Creating a message for a non-existent `roomId`.
12. **Public Flip**: Changing a `PRIVATE` room to `PUBLIC_LIVE` to leak history.

## Test Runner (Simplified for Context)

The following `firestore.rules.test.ts` (conceptual) will be used to verify these constraints.

```ts
// firestore.rules.test.ts logic
// 1. Unauthenticated users cannot read/write any chat data.
// 2. Authenticated users can create rooms they are part of.
// 3. Authenticated users can only read messages in rooms they are participants of.
// 4. Authenticated users can read messages in rooms with type 'PUBLIC_LIVE'.
// 5. Users cannot update participants of a room they don't own.
// 6. Users cannot spoof senderId on messages.
```
