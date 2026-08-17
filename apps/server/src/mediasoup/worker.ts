import * as Sentry from "@sentry/node";
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
    Sentry.captureException(new Error("[mediasoup] worker died unexpectedly"));
    console.error("[mediasoup] worker died — exiting");
    process.exit(1);
  });

  setInterval(async () => {
    try {
      const usage = await worker!.getResourceUsage();
      console.log(JSON.stringify({ type: "ms-worker-usage", ...usage }));
    } catch (e) {
      console.warn("[mediasoup] getResourceUsage failed:", e);
    }
  }, 30_000);

  console.log("[mediasoup] worker created");
  return worker;
}
