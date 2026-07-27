import * as mediasoup from "mediasoup";
import type { Worker } from "mediasoup/node/lib/types.js";

let worker: Worker | null = null;

export async function getWorker(): Promise<Worker> {
  if (worker) return worker;
  worker = await mediasoup.createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 49151,
    logLevel: "warn",
  });
  worker.on("died", () => {
    console.error("[mediasoup] worker died — exiting");
    process.exit(1);
  });
  console.log("[mediasoup] worker created");
  return worker;
}
