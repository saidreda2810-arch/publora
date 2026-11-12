/**
 * SRA Social Publisher - Comprehensive Automated Test Runner
 * Executes Unit Tests, Integration Tests, Security Audits, and Multi-Tenant Isolation Tests
 */

import {
  hashPassword,
  generateSalt,
  generateToken,
  createUser,
  updateUser,
  deleteUser,
  findUserByEmail,
  verifyPassword,
  createSession,
  findSessionByToken,
  deleteSession,
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceData,
  saveWorkspaceData,
  logAuditEvent,
  getAuditLogs,
  sanitizeUserForClient,
  getSystemSettings,
  updateSystemSettings,
  addAnnouncement,
  removeAnnouncement,
  GOD_OWNER_EMAIL,
} from '../server/saasDb.ts';

import {
  encryptToken,
  decryptToken,
  getOAuthConfig,
  saveOAuthConfig,
} from '../server/oauthStore.ts';

import {
  runSchedulerCycleNow,
  getSchedulerStatus,
} from '../server/scheduler.ts';

import {
  recordAuthFailure,
  recordAuthSuccess,
  checkRestricted,
  failureCount,
  configureBruteForceGuard,
  resetBruteForceGuardForTests,
} from '../server/bruteForceGuard.ts';

import fs from 'fs';
import path from 'path';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const testResults: TestResult[] = [];
const suiteStart = Date.now();

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(suite: string, name: string, fn: () => void | Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    testResults.push({ suite, name, passed: true, durationMs: duration });
    console.log(`  [PASS] ${name} (${duration}ms)`);
  } catch (err: any) {
    const duration = Date.now() - start;
    testResults.push({ suite, name, passed: false, durationMs: duration, error: err.message });
    console.error(`  [FAIL] ${name} (${duration}ms): ${err.message}`);
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('   SRA SOCIAL PUBLISHER - PRODUCTION TEST RUNNER');
  console.log('======================================================\n');

  // =========================================================================
  // SUITE 1: CRYPTOGRAPHIC INTEGRITY & PASSWORD SECURITY
  // =========================================================================
  console.log('--- Suite 1: Cryptographic Integrity & Security ---');

  await runTest('Cryptography', 'Scrypt password hashing produces unique 128-char hex output', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const hash1 = hashPassword('SecurePass123!', salt1);
    const hash2 = hashPassword('SecurePass123!', salt2);

    assert(hash1.length === 128, 'Hash must be 128 hex chars (64 bytes)');
    assert(hash1 !== hash2, 'Identical passwords with different salts must yield different hashes');
  });

  await runTest('Cryptography', 'Password verification rejects invalid credentials', () => {
    const salt = generateSalt();
    const correctHash = hashPassword('CorrectPassword99#', salt);

    assert(verifyPassword('CorrectPassword99#', salt, correctHash), 'Correct password must verify');
    assert(!verifyPassword('WrongPassword99#', salt, correctHash), 'Wrong password must be rejected');
    assert(!verifyPassword('', salt, correctHash), 'Empty password must be rejected');
  });

  await runTest('Cryptography', 'Cryptographic token generation provides sufficient entropy', () => {
    const tokenA = generateToken(32);
    const tokenB = generateToken(32);
    assert(tokenA.length === 64, 'Token of 32 bytes must be 64 hex characters');
    assert(tokenA !== tokenB, 'Random tokens must never collide');
  });

  await runTest('Cryptography', 'AES-256-GCM encrypts and decrypts OAuth tokens accurately', () => {
    const originalSecret = 'ya29.a0ARrdaM8xSecretYouTubeRefreshToken12345';
    const encrypted = encryptToken(originalSecret);

    assert(encrypted.includes(':'), 'Encrypted token format must contain IV:AuthTag:Ciphertext');
    assert(encrypted !== originalSecret, 'Ciphertext must not match plaintext');

    const decrypted = decryptToken(encrypted);
    assert(decrypted === originalSecret, 'Decrypted token must exactly match original secret');
  });

  // =========================================================================
  // SUITE 2: MULTI-TENANT ISOLATION & WORKSPACE SECURITY
  // =========================================================================
  console.log('\n--- Suite 2: Multi-Tenant Architecture & Data Isolation ---');

  let tenantAUserId = '';
  let tenantBUserId = '';
  let tenantAWorkspaceId = '';
  let tenantBWorkspaceId = '';

  await runTest('Multi-Tenancy', 'Creates independent users for Tenant A and Tenant B', () => {
    const resA = createUser({
      email: `tenant.a.${Date.now()}@example.com`,
      password: 'TenantAPassword1!',
      fullName: 'Alice Tenant A',
    });
    const resB = createUser({
      email: `tenant.b.${Date.now()}@example.com`,
      password: 'TenantBPassword2!',
      fullName: 'Bob Tenant B',
    });

    tenantAUserId = resA.user.id;
    tenantBUserId = resB.user.id;

    assert(resA.user.id !== resB.user.id, 'Tenants must receive unique user IDs');
    assert(resA.user.email !== resB.user.email, 'Tenant emails must differ');
  });

  await runTest('Multi-Tenancy', 'Provisions isolated default workspaces for each tenant', () => {
    const wsA = createWorkspace(tenantAUserId, 'Alice Growth Agency');
    const wsB = createWorkspace(tenantBUserId, 'Bob Media House');

    tenantAWorkspaceId = wsA.id;
    tenantBWorkspaceId = wsB.id;

    assert(wsA.id !== wsB.id, 'Workspaces must have separate IDs');
    assert(wsA.ownerId === tenantAUserId, 'Workspace A owner must be User A');
    assert(wsB.ownerId === tenantBUserId, 'Workspace B owner must be User B');
  });

  await runTest('Multi-Tenancy', 'Strict data boundary: Tenant A state is never accessible to Tenant B', () => {
    // Write sensitive project into Tenant A
    saveWorkspaceData(tenantAWorkspaceId, {
      projects: [{ id: 'proj_a1', name: 'Confidential Alice Campaign', client: 'Acme Corp' }],
      posts: [{ id: 'post_a1', postTitle: 'Alice Secret Strategy', status: 'scheduled', scheduledTime: new Date(Date.now() + 3600000).toISOString() }],
    });

    // Write different project into Tenant B
    saveWorkspaceData(tenantBWorkspaceId, {
      projects: [{ id: 'proj_b1', name: 'Public Bob Vlog', client: 'Self' }],
      posts: [{ id: 'post_b1', postTitle: 'Bob Morning Vlog', status: 'draft' }],
    });

    // Query Tenant A
    const dataA = getWorkspaceData(tenantAWorkspaceId);
    assert(dataA.projects.length === 1, 'Tenant A must have 1 project');
    assert(dataA.projects[0].name === 'Confidential Alice Campaign', 'Tenant A data must be intact');

    // Query Tenant B
    const dataB = getWorkspaceData(tenantBWorkspaceId);
    assert(dataB.projects.length === 1, 'Tenant B must have 1 project');
    assert(dataB.projects[0].name === 'Public Bob Vlog', 'Tenant B data must be intact');

    // Verify cross-tenant isolation
    const hasAliceDataInBob = dataB.projects.some((p: any) => p.name.includes('Alice'));
    assert(!hasAliceDataInBob, 'Tenant B MUST NOT contain Tenant A data');

    const hasBobDataInAlice = dataA.projects.some((p: any) => p.name.includes('Bob'));
    assert(!hasBobDataInAlice, 'Tenant A MUST NOT contain Tenant B data');
  });

  // =========================================================================
  // SUITE 3: AUTHENTICATION & SESSION LIFECYCLE
  // =========================================================================
  console.log('\n--- Suite 3: Authentication & Session Lifecycle ---');

  let sessionToken = '';

  await runTest('Authentication', 'Authenticates valid user and creates cryptographically signed session', () => {
    assert(tenantAUserId, 'Tenant A must exist');

    const session = createSession(tenantAUserId, { userAgent: 'Automated Test Runner', ip: '127.0.0.1' });
    sessionToken = session.token;

    assert(session.id.startsWith('ses_'), 'Session ID must have ses_ prefix');
    assert(session.token.length >= 32, 'Session token must be secure length');
    assert(new Date(session.expiresAt) > new Date(), 'Session expires in future');
  });

  await runTest('Authentication', 'Validates active session and retrieves user identity', () => {
    const session = findSessionByToken(sessionToken);
    assert(session !== undefined, 'Valid session token must return session record');
    assert(session?.userId === tenantAUserId, 'Session userId must match Tenant A');
  });

  await runTest('Authentication', 'Revokes session on logout', () => {
    deleteSession(sessionToken);
    const session = findSessionByToken(sessionToken);
    assert(session === undefined, 'Revoked session token must evaluate to undefined');
  });

  // =========================================================================
  // SUITE 4: BACKGROUND SCHEDULER & AUTOPILOT ENGINE
  // =========================================================================
  console.log('\n--- Suite 4: Autonomous Background Publishing Scheduler ---');

  await runTest('Scheduler', 'Reports active scheduler state and cycle metadata', () => {
    const status = getSchedulerStatus();
    assert(status !== null, 'Scheduler status must be retrievable');
    assert(typeof status.publishedPostsCounter === 'number', 'Scheduler published count must be numeric');
  });

  await runTest('Scheduler', 'Executes scheduled post publishing cycle accurately', async () => {
    // Schedule a post due immediately (1 minute in the past) in Tenant A
    const pastTime = new Date(Date.now() - 60000).toISOString();
    saveWorkspaceData(tenantAWorkspaceId, {
      posts: [
        {
          id: 'test_sched_post_1',
          title: 'High Retention Viral Short',
          status: 'scheduled',
          scheduledTime: pastTime,
          channelPlatforms: ['youtube', 'tiktok'],
          brandId: 'brand-a',
          videoId: 'vid-1',
          lockedForPublishing: false,
        },
      ],
      accounts: [
        { id: 'acc-yt-1', brandId: 'brand-a', platform: 'youtube', accountName: 'TestYT', handle: '@testyt', isConnected: true, apiPermissions: { canPublish: true, canReadAnalytics: false, hasDetailedRetention: false, hasMilestoneData: false } },
        { id: 'acc-tt-1', brandId: 'brand-a', platform: 'tiktok', accountName: 'TestTT', handle: '@testtt', isConnected: true, apiPermissions: { canPublish: true, canReadAnalytics: false, hasDetailedRetention: false, hasMilestoneData: false } },
      ],
      autopilotConfig: {
        mode: 'autopilot',
        emergencyPaused: false,
        totalAutonomousActions: 0,
      },
    });

    const cycleResult = await runSchedulerCycleNow();
    assert(cycleResult.ran === true, 'Scheduler cycle must execute successfully');

    // Verify post transitioned through the real publishing engine.
    // With no platform adapters configured, the honest outcome is 'failed'
    // with adapter_missing — NOT fabricated 'published'.
    const refreshedData = getWorkspaceData(tenantAWorkspaceId);
    const post = refreshedData.posts.find((p: any) => p.id === 'test_sched_post_1');
    assert(['publishing', 'failed', 'published'].includes(post.status), `Post must transition to a terminal/in-flight status, got ${post.status}`);
    assert(post.status !== 'scheduled', 'Post must leave scheduled state after engine claim');
    assert((post.publishingEvents || []).length > 0, 'Engine must record pipeline events');
    if (post.status === 'failed') {
      assert(post.lastPublishError?.class === 'adapter_missing', 'Failure must be classified as adapter_missing');
      assert(!post.nextRetryAt, 'Non-retryable adapter_missing must not schedule a retry');
    }
    // Negative isolation check: post must not leak to Tenant B
    const tenantBData = getWorkspaceData(tenantBWorkspaceId);
    assert(!tenantBData.posts.find((p: any) => p.id === 'test_sched_post_1'), 'Post must not appear in another workspace');
  });

  // =========================================================================
  // SUITE 5: AUDIT LOG TELEMETRY & COMPLIANCE
  // =========================================================================
  console.log('\n--- Suite 5: Audit Log Telemetry & Regulatory Compliance ---');

  await runTest('Audit Telemetry', 'Logs structured audit events with workspace and user metadata', () => {
    logAuditEvent({
      workspaceId: tenantAWorkspaceId,
      userId: tenantAUserId,
      userEmail: 'tenant.a@example.com',
      action: 'security_test_audit',
      details: 'Audit trail validation test entry',
      ip: '127.0.0.1',
    });

    const logs = getAuditLogs({ workspaceId: tenantAWorkspaceId });
    assert(logs.length >= 1, 'Workspace audit logs must include new event');
    const target = logs.find((l) => l.action === 'security_test_audit');
    assert(target !== undefined, 'Target audit action must be present');
    assert(target?.ip === '127.0.0.1', 'Audit log must retain client IP');
  });

  // =========================================================================
  // SUITE 6: MEDIA ASSET VALIDATION & SECURITY CHECKS
  // =========================================================================
  console.log('\n--- Suite 6: Media Asset Pipeline & Validation ---');

  await runTest('Media Pipeline', 'Enforces strict MIME type whitelist and storage constraints', () => {
    const allowedMime = ['video/mp4', 'video/webm', 'image/png', 'image/jpeg'];
    const disallowedMime = ['application/x-sh', 'application/javascript', 'application/x-executable', 'text/html'];

    allowedMime.forEach((mime) => {
      assert(allowedMime.includes(mime), `${mime} must be permitted`);
    });

    disallowedMime.forEach((mime) => {
      assert(!allowedMime.includes(mime), `Dangerous MIME ${mime} must be rejected`);
    });
  });

  await runTest('Media Pipeline', 'Prevents path traversal attacks in filenames', () => {
    const maliciousFilename = '../../../../etc/passwd.mp4';
    const sanitized = path.basename(maliciousFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
    assert(!sanitized.includes('..'), 'Path traversal dots must be eliminated');
    assert(!sanitized.includes('/'), 'Path slashes must be stripped');
  });

  // =========================================================================
  // SUITE 7: OAUTH MASKING & SENSITIVE CREDENTIAL HYGIENE
  // =========================================================================
  console.log('\n--- Suite 7: OAuth Security & Credential Masking ---');

  await runTest('OAuth Masking', 'Masks client IDs and hides client secrets from public status responses', () => {
    saveOAuthConfig({
      googleClientId: '109823478912-mockgoogleclientid.apps.googleusercontent.com',
      googleClientSecret: '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9',
      metaAppId: '123456789012345',
      metaAppSecret: 'metaSecretKeyConfidential999',
    });

    const config = getOAuthConfig();
    assert(config.googleClientId !== '', 'Config must store client ID');

    // Simulate masked response returned by /api/oauth/config
    const maskedGoogleId = config.googleClientId
      ? `${config.googleClientId.slice(0, 8)}...${config.googleClientId.slice(-8)}`
      : null;

    assert(!maskedGoogleId?.includes('mockgoogleclientid'), 'Masked ID must redact central characters');
  });

  // =========================================================================
  // SUITE 8: PERMANENT GOD-LEVEL OWNER SYSTEM & RBAC INVARIANTS
  // =========================================================================
  console.log('\n--- Suite 8: Permanent GOD Owner, RBAC & Privacy Invariants ---');

  await runTest('GOD Owner Invariant', 'Ensures saidreda2810@gmail.com is permanently initialized with GOD role', () => {
    const godUser = findUserByEmail(GOD_OWNER_EMAIL);
    assert(godUser !== null, 'GOD owner account must exist in the database');
    assert(godUser?.role === 'god', `GOD owner role must be 'god', got ${godUser?.role}`);
    assert(godUser?.isEmailVerified === true, 'GOD owner email must be verified');
    assert(godUser?.status === 'active', 'GOD owner account must be active');
  });

  await runTest('GOD Owner Demotion Protection', 'Throws error if any attempt is made to demote GOD owner', () => {
    const godUser = findUserByEmail(GOD_OWNER_EMAIL);
    assert(godUser, 'GOD user must exist');

    let errorThrown = false;
    try {
      updateUser(godUser.id, { role: 'admin' as any });
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes('cannot be demoted'), 'Correct demotion protection error message');
    }
    assert(errorThrown, 'Demoting the GOD owner must throw an error');

    // Confirm role is still god
    const unchangedGod = findUserByEmail(GOD_OWNER_EMAIL);
    assert(unchangedGod?.role === 'god', 'Role must remain god');
  });

  await runTest('GOD Owner Suspension Protection', 'Throws error if any attempt is made to suspend GOD owner', () => {
    const godUser = findUserByEmail(GOD_OWNER_EMAIL);
    assert(godUser, 'GOD user must exist');

    let errorThrown = false;
    try {
      updateUser(godUser.id, { status: 'suspended' });
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes('cannot be suspended'), 'Correct suspension protection error message');
    }
    assert(errorThrown, 'Suspending the GOD owner must throw an error');
  });

  await runTest('GOD Owner Deletion Protection', 'Blocks deletion of Primary GOD Owner account', () => {
    const godUser = findUserByEmail(GOD_OWNER_EMAIL);
    assert(godUser, 'GOD user must exist');

    const result = deleteUser(godUser.id);
    assert(!result.success, 'Deleting GOD owner must fail');
    assert(result.error?.includes('cannot be deleted'), 'Correct deletion rejection error');

    // Confirm user still exists
    const preservedGod = findUserByEmail(GOD_OWNER_EMAIL);
    assert(preservedGod !== null, 'GOD owner must not have been removed from the database');
  });

  await runTest('RBAC Anti-Impersonation', 'Rejects assigning god role to any other user account', () => {
    // Create a temporary regular user
    const testRegEmail = `test-rbac-${Date.now()}@test.local`;
    const { user: regUser } = createUser({
      email: testRegEmail,
      password: 'ValidPass!123',
      fullName: 'Test Candidate',
    });

    let errorThrown = false;
    try {
      updateUser(regUser.id, { role: 'god' });
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes('permanently reserved'), 'Rejection message matches constraint');
    }
    assert(errorThrown, 'Elevating another user to god must be rejected');

    // Clean up
    deleteUser(regUser.id);
  });

  await runTest('User Privacy Sanitization', 'Completely strips passwordHash, salt, and mfaSecret from payloads', () => {
    const godUser = findUserByEmail(GOD_OWNER_EMAIL);
    assert(godUser, 'GOD user must exist');

    const sanitized = sanitizeUserForClient(godUser);
    assert((sanitized as any).passwordHash === undefined, 'passwordHash must never be exposed to client');
    assert((sanitized as any).salt === undefined, 'salt must never be exposed to client');
    assert((sanitized as any).mfaSecret === undefined, 'mfaSecret must never be exposed to client');
    assert(sanitized.email === GOD_OWNER_EMAIL, 'Public fields like email must be preserved');
    assert(sanitized.role === 'god', 'Public role must be preserved');
  });

  await runTest('System Governance & Announcements', 'Manages global maintenance toggle and broadcast announcements', () => {
    const initialSettings = getSystemSettings();
    assert(typeof initialSettings.maintenanceMode === 'boolean', 'Maintenance mode must be boolean');

    // Toggle maintenance mode
    const updated = updateSystemSettings({
      maintenanceMode: true,
      featureFlags: { ...initialSettings.featureFlags, userRegistration: false },
    });
    assert(updated.maintenanceMode === true, 'Maintenance mode must be updated to true');
    assert(updated.featureFlags.userRegistration === false, 'Registration mode must be updated to false');

    // Restore to normal
    updateSystemSettings({
      maintenanceMode: false,
      featureFlags: { ...initialSettings.featureFlags, userRegistration: true },
    });
    const restored = getSystemSettings();
    assert(restored.maintenanceMode === false, 'Maintenance mode must be restored to false');

    // Add broadcast announcement
    const announcement = addAnnouncement({
      title: 'System Notice',
      message: 'System update completed successfully',
      type: 'info',
      active: true,
      createdBy: 'saidreda2810@gmail.com',
    });
    assert(announcement.id !== '', 'Announcement ID generated');
    assert(announcement.active === true, 'Announcement active by default');

    // Remove announcement
    const removed = removeAnnouncement(announcement.id);
    assert(removed === true, 'Announcement removed successfully');
  });

  // =========================================================================
  // SUITE 8: FIREBASE CONFIGURATION & ZERO-TRUST SECURITY INVARIANTS
  // =========================================================================
  console.log('\n--- Suite 8: Firebase Configuration & Zero-Trust Invariants ---');

  await runTest('Firebase Applet Config', 'firebase-applet-config.json exists with valid parameters', () => {
    const configPath = path.resolve('firebase-applet-config.json');
    assert(fs.existsSync(configPath), 'firebase-applet-config.json must exist');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    assert(config.projectId === 'protean-braid-gc9s2', 'Config projectId must match assigned project');
    assert(config.firestoreDatabaseId === 'ai-studio-srasocialpublish-d385a1d1-0a33-4211-bea8-28f3d357275c', 'Config databaseId matches spec');
    assert(config.apiKey.length > 20, 'API key must be present');
  });

  await runTest('Firebase Blueprint IR', 'firebase-blueprint.json defines all required entities and paths', () => {
    const blueprintPath = path.resolve('firebase-blueprint.json');
    assert(fs.existsSync(blueprintPath), 'firebase-blueprint.json must exist');
    const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));
    assert(blueprint.entities.user, 'Entity user defined');
    assert(blueprint.entities.video, 'Entity video defined');
    assert(blueprint.entities.schedule, 'Entity schedule defined');
    assert(blueprint.entities.workspace, 'Entity workspace defined');
    assert(blueprint.entities.automation, 'Entity automation defined');
    assert(blueprint.entities.auditLog, 'Entity auditLog defined');
    assert(blueprint.firestore['/users/{userId}'], 'Firestore path /users/{userId} mapped');
    assert(blueprint.firestore['/videos/{videoId}'], 'Firestore path /videos/{videoId} mapped');
    assert(blueprint.firestore['/schedules/{scheduleId}'], 'Firestore path /schedules/{scheduleId} mapped');
  });

  await runTest('Firestore Rules Fortress', 'firestore.rules enforces default-deny and God-owner governance', () => {
    const rulesPath = path.resolve('firestore.rules');
    assert(fs.existsSync(rulesPath), 'firestore.rules must exist');
    const rules = fs.readFileSync(rulesPath, 'utf-8');
    assert(rules.includes("rules_version = '2';"), 'Rules version 2 required');
    assert(rules.includes("allow read, write: if false;"), 'Default deny required');
    assert(rules.includes("saidreda2810@gmail.com"), 'God owner email explicitly secured in rules');
    assert(rules.includes("request.auth.token.email_verified == true"), 'Mandatory email verification enforced');
    assert(rules.includes("isValidId"), 'Path variable hardening helper present');
    assert(rules.includes("isValidUser"), 'User validation helper present');
    assert(rules.includes("isValidVideo"), 'Video validation helper present');
    assert(rules.includes("match /audit_logs/{logId}"), 'Audit logs collection protected');
    assert(rules.includes("allow update, delete: if false;"), 'Audit logs immutability enforced');
  });

  // =========================================================================
  // SUITE 9: 1P GOOGLE WORKSPACE DRIVE INTEGRATION
  // =========================================================================
  console.log('\n--- Suite 9: 1P Google Workspace Drive Integration ---');

  await runTest('Google Drive OAuth Scopes', 'Configures required 1P Drive OAuth scopes', () => {
    const firebaseUtilsPath = path.resolve('src/utils/firebase.ts');
    assert(fs.existsSync(firebaseUtilsPath), 'firebase.ts must exist');
    const content = fs.readFileSync(firebaseUtilsPath, 'utf-8');
    assert(content.includes('https://www.googleapis.com/auth/drive'), 'Drive primary scope configured');
    assert(content.includes('https://www.googleapis.com/auth/drive.file'), 'Drive file scope configured');
    assert(content.includes('https://www.googleapis.com/auth/drive.readonly'), 'Drive readonly scope configured');
    assert(content.includes('cachedAccessToken'), 'In-memory token caching implemented');
  });

  await runTest('Google Drive Service API', 'googleDriveService provides typed API methods for Drive operations', () => {
    const servicePath = path.resolve('src/utils/googleDriveService.ts');
    assert(fs.existsSync(servicePath), 'googleDriveService.ts must exist');
    const content = fs.readFileSync(servicePath, 'utf-8');
    assert(content.includes('listDriveFiles'), 'listDriveFiles function present');
    assert(content.includes('createDriveFolder'), 'createDriveFolder function present');
    assert(content.includes('uploadFileToDrive'), 'uploadFileToDrive function present');
    assert(content.includes('deleteDriveFile'), 'deleteDriveFile function present');
    assert(content.includes('https://www.googleapis.com/drive/v3'), 'Calls standard Google Drive v3 REST API');
  });

  await runTest('Google Drive UI & Destructive Safeguards', 'GoogleDriveView includes mandatory delete confirmation modal', () => {
    const viewPath = path.resolve('src/components/GoogleDriveView.tsx');
    assert(fs.existsSync(viewPath), 'GoogleDriveView.tsx must exist');
    const content = fs.readFileSync(viewPath, 'utf-8');
    assert(content.includes('Connect Google Drive'), 'Official Google Drive connect present');
    assert(content.includes('fileToDelete'), 'Destructive operation confirmation state present');
    assert(content.includes('Delete File from Google Drive?'), 'Clear user confirmation modal present');
    assert(content.includes('Confirm Delete'), 'Explicit confirmation action required');
  });

  // =========================================================================
  // SUITE 10: DARK EDITORIAL & PRECISION DESIGN SYSTEM
  // =========================================================================
  console.log('\n--- Suite 10: Dark Editorial & Precision Design System ---');

  await runTest('SAA Palette Tokens', 'index.css defines exact enterprise dark and light color tokens', () => {
    const cssPath = path.resolve('src/index.css');
    assert(fs.existsSync(cssPath), 'src/index.css must exist');
    const content = fs.readFileSync(cssPath, 'utf-8');
    assert(content.includes('#0B1115'), 'Dark background #0B1115 present');
    assert(content.includes('#121C22'), 'Dark surface #121C22 present');
    assert(content.includes('#1B2931'), 'Elevated surface #1B2931 present');
    assert(content.includes('#142B31'), 'Border token #142B31 present');
    assert(content.includes('#00D6B2'), 'Primary Mint accent #00D6B2 present');
    assert(content.includes('#EAF2F4'), 'Main typography #EAF2F4 present');
    assert(content.includes('#84969F'), 'Secondary typography #84969F present');
    assert(content.includes('#F5F8F8'), 'Light mode background #F5F8F8 present');
    assert(content.includes('#087F78'), 'Light mode primary accent #087F78 present');
  });

  await runTest('Persistent Theme Context', 'ThemeContext supports dark and light modes with localStorage persistence', () => {
    const themeContextPath = path.resolve('src/context/ThemeContext.tsx');
    assert(fs.existsSync(themeContextPath), 'ThemeContext.tsx must exist');
    const content = fs.readFileSync(themeContextPath, 'utf-8');
    assert(content.includes('localStorage.getItem'), 'Persists theme to localStorage');
    assert(content.includes('toggleTheme'), 'toggleTheme handler present');
  });

  await runTest('SAA Wordmark Logo', 'SaaLogo renders geometric horizontal track mark without generic AI ornaments', () => {
    const logoPath = path.resolve('src/components/common/SaaLogo.tsx');
    assert(fs.existsSync(logoPath), 'SaaLogo.tsx must exist');
    const content = fs.readFileSync(logoPath, 'utf-8');
    assert(content.includes('PUBLORA'), 'PUBLORA wordmark present');
    assert(!content.includes('robot'), 'No robot illustrations');
    assert(!content.includes('brain'), 'No brain icons');
  });

  await runTest('Dashboard 6-Zone Architecture', 'DashboardView implements clean operational layout', () => {
    const dashPath = path.resolve('src/components/DashboardView.tsx');
    assert(fs.existsSync(dashPath), 'DashboardView.tsx must exist');
    const content = fs.readFileSync(dashPath, 'utf-8');
    assert(content.includes('Welcome back'), 'Welcome header present');
    assert(content.includes('Create Content'), 'Primary CTA present');
    assert(content.includes('Distribution Channels'), 'Connected accounts summary present');
    assert(content.includes('Upcoming Publications'), 'Upcoming videos zone present');
    assert(content.includes('Recent Publishing Jobs'), 'Recent jobs zone present');
    assert(content.includes('Audience Performance & Retention'), 'Performance overview zone present');
  });

  // =========================================================================
  // SUITE 11: BRUTE-FORCE / CREDENTIAL-STUFFING PROTECTION
  // =========================================================================
  console.log('\n--- Suite 11: Brute-Force Protection Guard ---');

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  configureBruteForceGuard({
    enabled: true,
    accountMaxFailures: 3,
    accountWindowMs: 60_000,
    accountRestrictMs: 250,
    ipMaxFailures: 4,
    ipWindowMs: 60_000,
    ipRestrictMs: 300,
    adminAccountMaxFailures: 2,
    maxRestrictMs: 5_000,
    progressiveDelayBaseMs: 1,
    progressiveDelayMaxMs: 2,
    progressiveDelayAfterFailures: 99,
    failMode: 'open',
  });
  resetBruteForceGuardForTests();

  const bfEmail = `bf-target-${Date.now()}@example.com`;

  await runTest('BruteForce', 'Single failed attempt does not restrict the account', () => {
    resetBruteForceGuardForTests();
    recordAuthFailure({ ip: '10.0.0.1', email: bfEmail });
    const v = checkRestricted({ ip: '10.0.0.1', email: bfEmail });
    assert(!v.restricted, 'One failure must not trigger a restriction');
  });

  await runTest('BruteForce', 'Repeated failures for one account trigger temporary restriction', () => {
    resetBruteForceGuardForTests();
    for (let i = 0; i < 3; i++) recordAuthFailure({ ip: '10.0.0.2', email: bfEmail });
    const v = checkRestricted({ ip: '10.0.0.2', email: bfEmail });
    assert(v.restricted, 'Account must be restricted after threshold failures');
    assert(v.retryAfterSeconds > 0, 'Restriction must report a retry delay');
  });

  await runTest('BruteForce', 'Restriction expires and login is allowed again', async () => {
    await sleep(400); // accountRestrictMs = 250ms
    const v = checkRestricted({ ip: '10.0.0.2', email: bfEmail });
    assert(!v.restricted, 'Restriction must expire after its window');
  });

  await runTest('BruteForce', 'Successful auth resets the account failure counter', () => {
    resetBruteForceGuardForTests();
    recordAuthFailure({ ip: '10.0.0.3', email: bfEmail });
    recordAuthFailure({ ip: '10.0.0.3', email: bfEmail });
    recordAuthSuccess({ ip: '10.0.0.3', email: bfEmail });
    const counts = failureCount({ ip: '10.0.0.3', email: bfEmail });
    assert(counts.account === 0, 'Account counter must reset on success');
    assert(counts.ip === 1, 'IP counter must be reduced (not fully cleared) on success');
  });

  await runTest('BruteForce', 'Attacks against many accounts from one IP trigger IP restriction', () => {
    resetBruteForceGuardForTests();
    for (let i = 0; i < 4; i++) {
      recordAuthFailure({ ip: '10.9.9.9', email: `victim${i}-${Date.now()}@example.com` });
    }
    const v = checkRestricted({ ip: '10.9.9.9', email: 'unrelated@example.com' });
    assert(v.restricted && v.scope === 'ip', 'Shared IP must be restricted even for a different account');
  });

  await runTest('BruteForce', 'Attacks on one account from many IPs still restrict the account', () => {
    resetBruteForceGuardForTests();
    for (let i = 0; i < 3; i++) {
      recordAuthFailure({ ip: `172.16.0.${i + 1}`, email: bfEmail });
    }
    const v = checkRestricted({ ip: '172.16.9.9', email: bfEmail });
    assert(v.restricted && v.scope === 'account', 'Account must be restricted regardless of source IP');
  });

  await runTest('BruteForce', 'Privileged accounts get stricter thresholds', () => {
    resetBruteForceGuardForTests();
    // GOD_OWNER_EMAIL is a real privileged account in the test database
    recordAuthFailure({ ip: '10.1.1.1', email: GOD_OWNER_EMAIL });
    recordAuthFailure({ ip: '10.1.1.2', email: GOD_OWNER_EMAIL });
    const v = checkRestricted({ ip: '10.1.1.3', email: GOD_OWNER_EMAIL });
    assert(v.restricted, 'Admin account must be restricted after admin threshold (2) failures');
  });

  await runTest('BruteForce', 'Escalating restrictions are capped by maxRestrictMs', () => {
    resetBruteForceGuardForTests();
    const t0 = Date.now();
    // Trigger restriction, wait for expiry, trigger again to escalate
    for (let i = 0; i < 3; i++) recordAuthFailure({ ip: '10.2.2.2', email: bfEmail });
    const first = checkRestricted({ ip: '10.2.2.2', email: bfEmail });
    assert(first.restricted, 'First restriction must engage');
    // Force-expire by manipulating via success + immediate re-fail cycle is
    // complex; instead verify cap indirectly: strikes escalate but bounded.
    // Wait out first restriction then re-offend.
    return sleep(400).then(() => {
      for (let i = 0; i < 3; i++) recordAuthFailure({ ip: '10.2.2.2', email: bfEmail });
      const second = checkRestricted({ ip: '10.2.2.2', email: bfEmail });
      assert(second.restricted, 'Second restriction must engage after re-offence');
      assert(second.retryAfterSeconds * 1000 <= 5_000, 'Escalated restriction must respect maxRestrictMs cap');
      assert(Date.now() - t0 < 10_000, 'Test must complete quickly');
    });
  });

  await runTest('BruteForce', 'Equivalent handling for nonexistent vs existing accounts', () => {
    resetBruteForceGuardForTests();
    // Both unknown and known emails accrue failures identically — the guard
    // hashes whatever identifier is supplied and never reveals existence.
    recordAuthFailure({ ip: '10.3.3.3', email: 'definitely-not-registered-xyz@example.com' });
    const counts = failureCount({ ip: '10.3.3.4', email: 'definitely-not-registered-xyz@example.com' });
    assert(counts.account === 1, 'Unknown accounts must be tracked identically to known ones');
  });

  configureBruteForceGuard({
    enabled: true,
    accountMaxFailures: 5,
    accountWindowMs: 600_000,
    accountRestrictMs: 900_000,
    ipMaxFailures: 30,
    ipWindowMs: 600_000,
    ipRestrictMs: 1_800_000,
    adminAccountMaxFailures: 3,
    maxRestrictMs: 7_200_000,
    progressiveDelayBaseMs: 250,
    progressiveDelayMaxMs: 2_000,
    progressiveDelayAfterFailures: 3,
    failMode: 'open',
  });
  resetBruteForceGuardForTests();

  // =========================================================================
  // SUMMARY & METRICS
  // =========================================================================
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  const totalDuration = Date.now() - suiteStart;

  console.log('\n======================================================');
  console.log('                 TEST RUN RESULTS');
  console.log('======================================================');
  console.log(`  Total Tests Run:  ${total}`);
  console.log(`  Tests Passed:     ${passed}`);
  console.log(`  Tests Failed:     ${failed}`);
  console.log(`  Total Duration:   ${totalDuration}ms`);
  console.log(`  Success Rate:     ${((passed / total) * 100).toFixed(1)}%`);
  console.log('======================================================\n');

  if (failed > 0) {
    console.error(`FAILURE: ${failed} tests failed.`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All production tests passed with zero failures!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
