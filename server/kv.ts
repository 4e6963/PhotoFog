// The only server-side state: push subscriptions (+ their locations/prefs) and dedup markers.
import type { SyncPayload } from "../shared/types.ts";

export const SUB_TTL_MS = 30 * 24 * 3_600_000;
const SENT_TTL_MS = 48 * 3_600_000;

export interface StoredSub extends SyncPayload {
  id: string;
  updatedAt: number;
}

let kv: Deno.Kv | undefined;

export async function openStore(path = Deno.env.get("KV_PATH") ?? "./data/kv.sqlite3") {
  if (path !== ":memory:") await Deno.mkdir(path.replace(/[/\\][^/\\]*$/, ""), { recursive: true });
  kv = await Deno.openKv(path);
  return kv;
}

function db(): Deno.Kv {
  if (!kv) throw new Error("store not opened");
  return kv;
}

export async function subId(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(hash).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function putSub(payload: SyncPayload): Promise<StoredSub> {
  const id = await subId(payload.subscription.endpoint);
  const sub: StoredSub = { ...payload, id, updatedAt: Date.now() };
  await db().set(["subs", id], sub, { expireIn: SUB_TTL_MS });
  return sub;
}

export async function getSub(endpoint: string): Promise<StoredSub | null> {
  return (await db().get<StoredSub>(["subs", await subId(endpoint)])).value;
}

export async function deleteSub(endpointOrId: string, isId = false) {
  const id = isId ? endpointOrId : await subId(endpointOrId);
  await db().delete(["subs", id]);
}

export async function* listSubs(): AsyncGenerator<StoredSub> {
  const now = Date.now();
  for await (const e of db().list<StoredSub>({ prefix: ["subs"] })) {
    // expireIn is lazy in Deno KV; enforce the TTL ourselves too.
    if (now - e.value.updatedAt < SUB_TTL_MS) yield e.value;
  }
}

/** Atomically marks an alert as sent. Returns false if it was already sent. */
export async function markSent(subId: string, key: string): Promise<boolean> {
  const k = ["sent", subId, key];
  const res = await db().atomic().check({ key: k, versionstamp: null })
    .set(k, Date.now(), { expireIn: SENT_TTL_MS }).commit();
  return res.ok;
}

export async function unmarkSent(subId: string, key: string) {
  await db().delete(["sent", subId, key]);
}
