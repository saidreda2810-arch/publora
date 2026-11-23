/**
 * server/repos/ — WP4 repository layer behind DB_DRIVER=json|pg.
 * JsonRepo wraps existing saasDb behavior unchanged. PgRepo targets the
 * 0001+0002 schema — written but UNTESTED (no live Postgres yet).
 */
import type { User, UserSession, Workspace, WorkspaceMember, WorkspaceDataPayload, AuditLogEntry, VerificationToken } from '../saasDb.ts';

export interface Page<T> { items: T[]; nextCursor?: string | null; }

export interface UsersRepo {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  create(data: Parameters<typeof import('../saasDb.ts').createUser>[0]): Promise<any>;
  update(id: string, updates: Partial<User>): Promise<User | undefined>;
  delete(id: string): Promise<{ success: boolean; error?: string }>;
}

export interface SessionsRepo {
  create(userId: string, meta?: { ip?: string; userAgent?: string }): Promise<UserSession>;
  findByToken(token: string): Promise<UserSession | undefined>;
  delete(token: string): Promise<void>;
  deleteForUser(userId: string): Promise<void>;
}

export interface WorkspacesRepo {
  findById(id: string): Promise<Workspace | undefined>;
  create(ownerId: string, name: string): Promise<Workspace>;
  update(id: string, updates: Partial<Workspace>): Promise<Workspace | undefined>;
  forUser(userId: string): Promise<Workspace[]>;
  memberRole(userId: string, workspaceId: string): Promise<string | undefined>;
  members(workspaceId: string): Promise<WorkspaceMember[]>;
}

export interface WorkspaceStateRepo {
  get(workspaceId: string): Promise<WorkspaceDataPayload>;
  getVersion(workspaceId: string): Promise<number>;
  /** Atomic compare-and-swap: returns false on version conflict. */
  save(workspaceId: string, data: Partial<WorkspaceDataPayload>, baseVersion: number): Promise<boolean>;
}

export interface AuditRepo {
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void>;
  list(filter?: { workspaceId?: string; userId?: string; limit?: number }): Promise<AuditLogEntry[]>;
}

export interface AuthTokensRepo {
  create(token: Omit<VerificationToken, 'id' | 'createdAt'> & { createdAt?: string }): Promise<VerificationToken>;
  findValid(type: string, tokenHash: string): Promise<VerificationToken | undefined>;
  consume(id: string): Promise<void>;
  purgeExpired(): Promise<number>;
}

export interface SaasRepos {
  users: UsersRepo;
  sessions: SessionsRepo;
  workspaces: WorkspacesRepo;
  workspaceState: WorkspaceStateRepo;
  audit: AuditRepo;
  authTokens: AuthTokensRepo;
  driver: 'json' | 'pg';
}
