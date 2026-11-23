/**
 * Phase 0 Payload-First Security Test Specification for SMOKK Firestore Rules.
 * Verifies the "Dirty Dozen" adversarial payloads against firestore.rules.
 *
 * Designed for execution with @firebase/rules-unit-testing against the
 * Firebase Firestore Emulator.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: {
    uid: string;
    email?: string;
    email_verified?: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated site defacement',
    operation: 'update',
    path: 'site_config/main',
    auth: null,
    payload: { artistName: 'HACKED' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Non-admin track injection',
    operation: 'create',
    path: 'tracks/evil-track',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    payload: {
      title: 'Spam',
      artist: 'Attacker',
      sourceType: 'url',
      audioUrl: 'https://evil.example/spam.mp3',
      mimeType: 'audio/mpeg',
      fileName: 'spam.mp3',
      fileSize: 1000,
      chunkCount: 0,
      order: 1,
      isPublic: true,
      ownerId: 'attacker_1',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Email spoofing without email_verified',
    operation: 'update',
    path: 'site_config/main',
    auth: {
      uid: 'spoofed_uid',
      email: 'claudioagustinbrunello@gmail.com',
      email_verified: false,
    },
    payload: { artistName: 'SPOOFED' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Self-assigned admin role escalation',
    operation: 'create',
    path: 'admins/attacker_1',
    auth: { uid: 'attacker_1', email: 'attacker@example.com', email_verified: true },
    payload: {
      role: 'admin',
      displayName: 'Attacker',
      createdBy: 'attacker_1',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow field injection on track create',
    operation: 'create',
    path: 'tracks/track_shadow',
    auth: {
      uid: 'admin_uid',
      email: 'claudioagustinbrunello@gmail.com',
      email_verified: true,
    },
    payload: {
      title: 'Forte',
      artist: 'SMOKK',
      sourceType: 'upload',
      audioUrl: '',
      mimeType: 'audio/mpeg',
      fileName: 'forte.mp3',
      fileSize: 2048,
      chunkCount: 1,
      order: 1,
      isPublic: true,
      ownerId: 'admin_uid',
      isVerified: true, // Ghost field
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immutable ownerId modification on update',
    operation: 'update',
    path: 'tracks/track_1',
    auth: {
      uid: 'admin_uid',
      email: 'claudioagustinbrunello@gmail.com',
      email_verified: true,
    },
    payload: { ownerId: 'someone_else' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Backdated client timestamp on gallery create',
    operation: 'create',
    path: 'gallery/img_backdate',
    auth: {
      uid: 'admin_uid',
      email: 'claudioagustinbrunello@gmail.com',
      email_verified: true,
    },
    payload: {
      title: 'Backdated',
      imageUrl: 'https://example.com/photo.jpg',
      order: 1,
      isPublic: true,
      ownerId: 'admin_uid',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Orphaned MP3 chunk without parent track',
    operation: 'create',
    path: 'tracks/nonexistent_parent/chunks/chunk_0000',
    auth: {
      uid: 'admin_uid',
      email: 'claudioagustinbrunello@gmail.com',
      email_verified: true,
    },
    payload: {
      trackId: 'nonexistent_parent',
      index: 0,
      data: 'SGVsbG8=',
      isPublic: true,
      ownerId: 'admin_uid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Cross-track chunk trackId mismatch',
    operation: 'create',
    path: 'tracks/track_a/chunks/chunk_0000',
    auth: {
      uid: 'admin_uid',
      email: 'claudioagustinbrunello@gmail.com',
      email_verified: true,
    },
    payload: {
      trackId: 'track_b',
      index: 0,
      data: 'SGVsbG8=',
      isPublic: true,
      ownerId: 'admin_uid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Oversized title string poisoning',
    operation: 'create',
    path: 'gallery/img_huge',
    auth: {
      uid: 'admin_uid',
      email: 'claudioagustinbrunello@gmail.com',
      email_verified: true,
    },
    payload: {
      title: 'A'.repeat(500),
      imageUrl: 'https://example.com/photo.jpg',
      order: 1,
      isPublic: true,
      ownerId: 'admin_uid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Invalid document ID characters (ID poisoning)',
    operation: 'create',
    path: 'tracks/bad$id!chars',
    auth: {
      uid: 'admin_uid',
      email: 'claudioagustinbrunello@gmail.com',
      email_verified: true,
    },
    payload: {
      title: 'Bad ID',
      artist: 'SMOKK',
      sourceType: 'url',
      audioUrl: 'https://example.com/a.mp3',
      mimeType: 'audio/mpeg',
      fileName: 'a.mp3',
      fileSize: 100,
      chunkCount: 0,
      order: 1,
      isPublic: true,
      ownerId: 'admin_uid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthenticated scraping of non-public tracks',
    operation: 'list',
    path: 'tracks',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
];
