import { useState, useEffect, useRef, useCallback } from "react";
import { Device } from "mediasoup-client";
import type { Room } from "colyseus.js";
import type { ScreenShareBroadcastPayload, ScreenShareStoppedPayload } from "@mentoring/shared";

const SERVER_HTTP_URL =
  ((import.meta as any).env?.VITE_SERVER_URL as string | undefined)
    ?.replace("ws://", "http://")
    ?.replace("wss://", "https://") ?? "http://localhost:2567";

export interface ScreenShareEntry {
  stream: MediaStream;
  presenterName: string;
  presenterId: string;
}

export function useScreenShare(room: Room | null) {
  const [isSharing, setIsSharing] = useState(false);
  // presenterId → entry
  const [screenShares, setScreenShares] = useState<Map<string, ScreenShareEntry>>(new Map());

  const deviceRef = useRef<Device | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendTransportRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const producerRef = useRef<any>(null);
  // presenterId → { consumer, recvTransport }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consumersRef = useRef<Map<string, { consumer: any; recvTransport: any }>>(new Map());

  async function getDevice(roomId: string): Promise<Device> {
    if (deviceRef.current?.loaded) return deviceRef.current;
    const device = new Device();
    const res = await fetch(`${SERVER_HTTP_URL}/ms/rtp-capabilities/${roomId}`);
    const { rtpCapabilities } = await res.json();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    deviceRef.current = device;
    return device;
  }

  useEffect(() => {
    if (!room) return;

    room.onMessage<ScreenShareBroadcastPayload>("screenshare-started", async ({ producerId, presenterId, presenterName }) => {
      try {
        const device = await getDevice(room.roomId);

        const transportRes = await fetch(`${SERVER_HTTP_URL}/ms/transport/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.roomId, direction: "recv" }),
        });
        const transportParams = await transportRes.json();

        const recvTransport = device.createRecvTransport(transportParams);

        recvTransport.on("connect", async ({ dtlsParameters }: any, callback: () => void, errback: (e: Error) => void) => {
          try {
            await fetch(`${SERVER_HTTP_URL}/ms/transport/connect`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transportId: recvTransport.id, dtlsParameters }),
            });
            callback();
          } catch (e) {
            errback(e as Error);
          }
        });

        const consumeRes = await fetch(`${SERVER_HTTP_URL}/ms/consume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: room.roomId,
            transportId: recvTransport.id,
            producerId,
            rtpCapabilities: device.rtpCapabilities,
          }),
        });
        const consumeParams = await consumeRes.json();
        if (consumeParams.error) {
          console.error("[screenshare] consume error:", consumeParams.error);
          return;
        }

        const consumer = await recvTransport.consume(consumeParams);
        await consumer.resume();

        consumersRef.current.set(presenterId, { consumer, recvTransport });

        const stream = new MediaStream([consumer.track]);
        setScreenShares((prev) => {
          const next = new Map(prev);
          next.set(presenterId, { stream, presenterName, presenterId });
          return next;
        });
      } catch (e) {
        console.error("[screenshare] consume failed:", e);
      }
    });

    room.onMessage<ScreenShareStoppedPayload>("screenshare-stopped", ({ presenterId }) => {
      const entry = consumersRef.current.get(presenterId);
      if (entry) {
        entry.consumer.close();
        entry.recvTransport.close();
        consumersRef.current.delete(presenterId);
      }
      setScreenShares((prev) => {
        const next = new Map(prev);
        next.delete(presenterId);
        return next;
      });
    });
  }, [room]);

  const startShare = useCallback(async () => {
    if (!room) return;
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = displayStream.getVideoTracks()[0];

      const device = await getDevice(room.roomId);

      const transportRes = await fetch(`${SERVER_HTTP_URL}/ms/transport/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.roomId, direction: "send" }),
      });
      const transportParams = await transportRes.json();

      const sendTransport = device.createSendTransport(transportParams);
      sendTransportRef.current = sendTransport;

      sendTransport.on("connect", async ({ dtlsParameters }: any, callback: () => void, errback: (e: Error) => void) => {
        try {
          await fetch(`${SERVER_HTTP_URL}/ms/transport/connect`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transportId: sendTransport.id, dtlsParameters }),
          });
          callback();
        } catch (e) {
          errback(e as Error);
        }
      });

      sendTransport.on("produce", async ({ kind, rtpParameters }: any, callback: (p: { id: string }) => void, errback: (e: Error) => void) => {
        try {
          const res = await fetch(`${SERVER_HTTP_URL}/ms/produce`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transportId: sendTransport.id, kind, rtpParameters }),
          });
          const { id } = await res.json();
          callback({ id });
        } catch (e) {
          errback(e as Error);
        }
      });

      const producer = await sendTransport.produce({ track });
      producerRef.current = producer;

      room.send("screenshare-start", { producerId: producer.id });
      setIsSharing(true);

      track.onended = () => stopShare();
    } catch (e) {
      console.error("[screenshare] startShare failed:", e);
    }
  }, [room]);

  const stopShare = useCallback(() => {
    producerRef.current?.close();
    sendTransportRef.current?.close();
    producerRef.current = null;
    sendTransportRef.current = null;
    room?.send("screenshare-stop", {});
    setIsSharing(false);
  }, [room]);

  return { isSharing, startShare, stopShare, screenShares };
}
