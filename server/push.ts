// Web Push (RFC 8291/8292) via @negrel/webpush. VAPID keys come from VAPID_KEYS (JSON) or are
// generated once into VAPID_FILE so a fresh self-hosted instance works without setup.
import * as webpush from "@negrel/webpush";
import type { SyncPayload } from "../shared/types.ts";

export interface PushPayload {
  title: string;
  body: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
  url?: string;
}

let appServer: webpush.ApplicationServer;
let publicKey: string;

async function loadKeys(): Promise<webpush.ExportedVapidKeys> {
  const env = Deno.env.get("VAPID_KEYS");
  if (env) return JSON.parse(env);

  const file = Deno.env.get("VAPID_FILE") ?? "./data/vapid.json";
  try {
    return JSON.parse(await Deno.readTextFile(file));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
    const exported = await webpush.exportVapidKeys(
      await webpush.generateVapidKeys({ extractable: true }),
    );
    await Deno.mkdir(file.replace(/[/\\][^/\\]*$/, ""), { recursive: true });
    await Deno.writeTextFile(file, JSON.stringify(exported, null, 2));
    console.log(`generated new VAPID keys in ${file}`);
    return exported;
  }
}

export async function initPush() {
  const keys = await webpush.importVapidKeys(await loadKeys(), { extractable: false });
  appServer = await webpush.ApplicationServer.new({
    contactInformation: Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@localhost",
    vapidKeys: keys,
  });
  publicKey = await webpush.exportApplicationServerKey(keys);
}

export const vapidPublicKey = () => publicKey;

/** "gone" means the subscription is dead and should be deleted. */
export async function sendPush(
  sub: SyncPayload["subscription"],
  payload: PushPayload,
): Promise<"ok" | "gone" | "error"> {
  try {
    await appServer.subscribe(sub).pushTextMessage(JSON.stringify(payload), {
      ttl: 6 * 3600,
      topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
    });
    return "ok";
  } catch (e) {
    if (e instanceof webpush.PushMessageError) {
      const status = e.response.status;
      if (status === 404 || status === 410) return "gone";
      console.warn(`push failed: ${status} ${await e.response.text().catch(() => "")}`);
    } else {
      console.warn("push failed:", e);
    }
    return "error";
  }
}
