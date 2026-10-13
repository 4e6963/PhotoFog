// Prints a new VAPID key pair as one-line JSON, ready to paste into VAPID_KEYS.
import { generateKeys } from "./push.ts";

console.log(JSON.stringify(await generateKeys()));
