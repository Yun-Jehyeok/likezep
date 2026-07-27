import { useState, useEffect, useRef, useCallback } from "react";
import { Device } from "mediasoup-client";
import type { Room } from "colyseus.js";
import type { ScreenShareBroadcastPayload, ScreenShareStoppedPayload } from "@mentoring/shared";

const SERVER_HTTP_URL =
  ((import.meta as any).env?.VITE_SERVER_URL as string | undefined)
    ?.replace("ws://", "http://")
    ?.replace("wss://", "https://") ?? "http://localhost:2567";

export function useScreenShare(room: Room | null) {
  const [isSharing, setIsSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const deviceRef = useRef<Device | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendTransportRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const producerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recvTransportRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const consumerRef = useRef<any>(null);

  async function getDevice(roomId: string): Promise<Device> {
    if (deviceRef.current?.loaded) return deviceRef.current;
    const device = new Device();
    const res = await fetch(`${SERVER_HTTP_URL}/ms/rtp-capabilities/${roomId}`);
    const { rtpCapabilities } = await res.json();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    deviceRef.current = device;
    return device;
  }

  // 시청자: screenshare-started 수신 시 consume
  useEffect(() => {
    if (!room) return;

    room.onMessage<ScreenShareBroadcastPayload>("screenshare-started", async ({ producerId }) => {
      try {
        const device = await getDevice(room.roomId);

        const transportRes = await fetch(`${SERVER_HTTP_URL}/ms/transport/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.roomId, direction: "recv" }),
        });
        const transportParams = await transportRes.json();

        const recvTransport = device.createRecvTransport(transportParams);
        recvTransportRef.current = recvTransport;

        recvTransport.on("connectionstatechange", (state: string) => {
          console.log("[screenshare] recvTransport connectionState:", state);
        });

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
        consumerRef.current = consumer;
        await consumer.resume();

        console.log("[screenshare] consumer track state:", consumer.track.readyState, "muted:", consumer.track.muted, "paused:", consumer.paused);
        const stream = new MediaStream([consumer.track]);
        setScreenStream(stream);
        console.log("[screenshare] consuming producerId:", producerId);
      } catch (e) {
        console.error("[screenshare] consume failed:", e);
      }
    });

    room.onMessage<ScreenShareStoppedPayload>("screenshare-stopped", () => {
      consumerRef.current?.close();
      recvTransportRef.current?.close();
      consumerRef.current = null;
      recvTransportRef.current = null;
      setScreenStream(null);
      console.log("[screenshare] presenter stopped sharing");
    });
  }, [room]);

  // 발표자: 화면공유 시작
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
      console.log("[screenshare] producer.id:", producer.id);

      room.send("screenshare-start", { producerId: producer.id });
      setIsSharing(true);

      // 브라우저 UI에서 공유 중단 시 자동 처리
      track.onended = () => stopShare();
    } catch (e) {
      console.error("[screenshare] startShare failed:", e);
    }
  }, [room]);

  // 발표자: 화면공유 중단
  const stopShare = useCallback(() => {
    producerRef.current?.close();
    sendTransportRef.current?.close();
    producerRef.current = null;
    sendTransportRef.current = null;
    room?.send("screenshare-stop", {});
    setIsSharing(false);
    console.log("[screenshare] stopped sharing");
  }, [room]);

  return { isSharing, startShare, stopShare, screenStream };
}
