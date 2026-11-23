# Security Specification — SMOKK Official Site & Admin CMS

## 1. Data Invariants

1. **Single-Source Admin Authority**: All write operations (`create`, `update`, `delete`) across `site_config`, `tracks`, `tracks/{trackId}/chunks`, `gallery`, `collaborations`, and `admins` strictly require a verified email (`request.auth.token.email_verified == true`) belonging to the bootstrapped admin or a UID registered in `/admins/{uid}`.
2. **Public Read Isolation**: Unauthenticated visitors may only read documents explicitly marked `isPublic == true` (`site_config/main`, active `tracks`, their `chunks`, visible `gallery` items, and visible `collaborations`). Private/draft records (`isPublic == false`) and `/admins` documents are denied to non-admins.
3. **Chunk Relational Integrity (Master Gate)**: A document in `/tracks/{trackId}/chunks/{chunkId}` cannot be created or updated unless its parent `/tracks/{trackId}` exists, its `trackId` field matches the path `{trackId}`, and its base64 `data` payload is strictly bounded (`<= 650000` bytes).
4. **Immutability & Temporal Integrity**: `ownerId` and `createdAt` are immutable after document creation. Every `create` requires `createdAt == request.time`, and every `create`/`update` requires `updatedAt == request.time`.
5. **No Shadow Fields & Bounded Strings**: Every entity enforces `keys().hasAll(...)` and `keys().hasOnly(...)`, strict `.size()` limits on all strings, bounded numeric ranges, and `isValidId()` regex guards on document IDs.
6. **Zero PII Leakage**: No personal emails, phone numbers, or addresses are exposed in public collections or open user collections. `/admins/{adminId}` stores only `role`, `displayName`, `createdBy`, and `createdAt`.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Target Path | Malicious Payload / Context | Expected Result |
|---|---|---|---|---|
| 1 | Unauthenticated Site Defacement | `/site_config/main` | `update` with `auth: null`, changing `artistName` to `"HACKED"` | `PERMISSION_DENIED` |
| 2 | Non-Admin Track Injection | `/tracks/evil-track` | Authenticated non-admin user attempts `create` of a new MP3 track | `PERMISSION_DENIED` |
| 3 | Email Spoofing (Unverified Email) | `/site_config/main` | `auth.token.email == "claudioagustinbrunello@gmail.com"` with `email_verified: false` | `PERMISSION_DENIED` |
| 4 | Self-Assigned Admin Escalation | `/admins/attacker_uid` | Non-admin user attempts `create` of `/admins/{theirUid}` with `role: "admin"` | `PERMISSION_DENIED` |
| 5 | Shadow Field Injection | `/tracks/track1` | Admin `create` with extra ghost field `isVerified: true` | `PERMISSION_DENIED` |
| 6 | Immutable `ownerId` Tampering | `/tracks/track1` | Admin `update` attempting to change `ownerId` to `"other_uid"` | `PERMISSION_DENIED` |
| 7 | Client Timestamp Backdating | `/gallery/img1` | Admin `create` with `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` | `PERMISSION_DENIED` |
| 8 | Orphaned MP3 Chunk Creation | `/tracks/nonexistent/chunks/chunk_0000` | Admin `create` chunk when parent `/tracks/nonexistent` does not exist | `PERMISSION_DENIED` |
| 9 | Path-Payload Mismatch on Chunk | `/tracks/trackA/chunks/chunk_0000` | Admin `create` chunk with `trackId: "trackB"` | `PERMISSION_DENIED` |
| 10 | Denial-of-Wallet Oversized String | `/gallery/img1` | Admin `create` with `title` length `> 140` or `imageUrl` length `> 650000` | `PERMISSION_DENIED` |
| 11 | ID Poisoning | `/tracks/invalid$id!with/badchars` | Admin `create` with path ID failing `^[a-zA-Z0-9_\-]+$` or >128 chars | `PERMISSION_DENIED` |
| 12 | Hidden Draft Scraping | `/tracks` (`list`) | Unauthenticated visitor queries all tracks without `where('isPublic', '==', true)` | `PERMISSION_DENIED` |
