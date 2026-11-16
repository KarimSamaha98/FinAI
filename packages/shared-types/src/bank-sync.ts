import { z } from "zod";

/**
 * Bank Sync: a connection binds one FinAI account to a bank's online-banking
 * login URL. On "Sync", FinAI opens that URL in a popup; the user signs in
 * and downloads the CSV themselves, and the extension captures that single
 * download, uploads it into the existing CSV import pipeline and returns the
 * user to the app's import review. There is no script, no recipe, no
 * recording — the only automation is opening the tab and watching for the
 * download. Recipes/connections are per-user and private (RLS below via the
 * API's tenant context).
 */

export const BankConnectionStatusSchema = z.enum(["active", "disconnected"]);
export type BankConnectionStatus = z.infer<typeof BankConnectionStatusSchema>;

export const BankConnectionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  /** Normalized hostname of loginUrl — display and grouping only, never used for permissions. */
  bankSlug: z.string().max(200),
  /** The pasted online-banking sign-on URL FinAI opens on "Sync". */
  loginUrl: z.string().url(),
  status: BankConnectionStatusSchema,
  lastSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BankConnection = z.infer<typeof BankConnectionSchema>;

export const CreateBankConnectionInputSchema = z.object({
  accountId: z.string().uuid(),
  loginUrl: z
    .string()
    .trim()
    .url()
    .refine((url) => url.startsWith("http://") || url.startsWith("https://"), "Must be an http(s) URL"),
});
export type CreateBankConnectionInput = z.infer<typeof CreateBankConnectionInputSchema>;

/**
 * Runtime payload the web app hands to the pairing handshake (and the
 * extension stores): where the API lives plus Supabase config for the
 * extension's own token refresh. Tokens are the web app's current session —
 * the extension never sees the user's bank credentials.
 */
export const PairingPayloadSchema = z.object({
  apiBaseUrl: z.string().url(),
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
export type PairingPayload = z.infer<typeof PairingPayloadSchema>;

/** Messages passed between the web app and the extension over window.postMessage. */
export const BridgeMessageSchema = z.discriminatedUnion("kind", [
  // App → extension: announce itself; extension replies with `pairing-accepted` or `pair-error`.
  z.object({ kind: z.literal("finai:pair"), payload: PairingPayloadSchema }),
  // App → extension: open the bank popup for a sync.
  z.object({
    kind: z.literal("finai:start-sync"),
    connectionId: z.string().uuid(),
    /** Exact origin pattern for the optional host-permission check, e.g. https://www.bank.example/* */
    originPattern: z.string().min(1),
  }),
  // App → extension: abandon the running sync.
  z.object({ kind: z.literal("finai:cancel-sync"), connectionId: z.string().uuid() }),
  // Extension → app variants.
  z.object({ kind: z.literal("finai:bridge-ready") }),
  z.object({ kind: z.literal("finai:pairing-accepted") }),
  z.object({ kind: z.literal("finai:pair-error"), errorMessage: z.string() }),
  z.object({ kind: z.literal("finai:not-installed") }),
  /** Extension tells the app whether Chrome's "Allow access to file URLs" toggle is on — needed for disk-read capture of one-time-token exports. */
  z.object({ kind: z.literal("finai:file-access"), allowed: z.boolean() }),
  /** Live sync progress: waiting = user is signing in / downloading; capturing = CSV uploaded; complete = ready to review. */
  z.object({
    kind: z.literal("finai:sync-status"),
    connectionId: z.string(),
    accountId: z.string().uuid(),
    status: z.enum(["waiting", "capturing", "complete", "failed", "cancel"]),
    message: z.string().max(200).default(""),
    errorMessage: z.string().nullable().default(null),
    uploadedFileId: z.string().uuid().nullable().default(null),
    fileName: z.string().default(""),
  }),
]);
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>;
