/**
 * 화면공유 React 훅 — mediasoup SFU 방식
 *
 * P2P WebRTC(근접 화상)와 달리 화면공유는 SFU(Selective Forwarding Unit) 방식을 사용한다.
 *
 * P2P vs SFU 비교:
 * ┌─────────┬────────────────────────────────────────────────┐
 * │ P2P     │ 발표자 → 모든 시청자에게 각각 스트림 전송      │
 * │         │ 시청자 수 N명이면 발표자 업로드 대역폭 × N     │
 * ├─────────┼────────────────────────────────────────────────┤
 * │ SFU     │ 발표자 → 서버로 한 번만 전송 (produce)         │
 * │         │ 서버 → 각 시청자에게 포워딩 (consume)          │
 * │         │ 발표자 업로드 대역폭 절감, 화면공유에 적합      │
 * └─────────┴────────────────────────────────────────────────┘
 *
 * mediasoup 화면공유 흐름:
 *
 * [발표자]                          [서버(mediasoup)]              [시청자]
 *   │                                    │                           │
 *   │── POST /ms/rtp-capabilities ──────►│                           │
 *   │◄── routerRtpCapabilities ──────────│                           │
 *   │ device.load(rtpCapabilities)        │                           │
 *   │                                    │                           │
 *   │── POST /ms/transport/create ──────►│                           │
 *   │◄── sendTransport params ───────────│                           │
 *   │ sendTransport.on("connect") ──────►│ (DTLS 핸드셰이크)          │
 *   │                                    │                           │
 *   │── getDisplayMedia() → track        │                           │
 *   │ sendTransport.produce(track) ─────►│── POST /ms/produce        │
 *   │◄─────────────────────── producerId │                           │
 *   │── room.send("screenshare-start") ─►│── broadcast ─────────────►│
 *   │                                    │                           │ screenshare-started
 *   │                                    │                           │ device.load()
 *   │                                    │◄── POST /ms/transport ────│
 *   │                                    │─── recvTransport params ──►│
 *   │                                    │◄── POST /ms/consume ──────│
 *   │                                    │─── consumer params ───────►│
 *   │                                    │                           │ consumer.resume()
 *   │                                    │                           │ new MediaStream([track])
 */
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
  /** presenterId → ScreenShareEntry. 동시에 여러 사람이 공유할 수 있어 Map을 사용. */
  const [screenShares, setScreenShares] = useState<Map<string, ScreenShareEntry>>(new Map());

  /** mediasoup Device는 RTP 능력(코덱 등)을 로드한 이후 재사용한다 */
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);  // 발표자: 송신 transport
  const producerRef = useRef<any>(null);       // 발표자: 화면 producer
  /** presenterId → { consumer, recvTransport } — 각 발표자별로 별도 consumer를 유지 */
  const consumersRef = useRef<Map<string, { consumer: any; recvTransport: any }>>(new Map());

  /**
   * mediasoup Device를 초기화하고 반환한다.
   * 이미 로드된 Device가 있으면 재사용 (같은 룸 내에서는 RTP 능력이 동일하다).
   */
  async function getDevice(roomId: string): Promise<Device> {
    if (deviceRef.current?.loaded) return deviceRef.current;
    const device = new Device();
    const res = await fetch(`${SERVER_HTTP_URL}/ms/rtp-capabilities/${roomId}`);
    const { rtpCapabilities } = await res.json();
    // Device가 지원하는 코덱을 서버 라우터 능력에 맞게 설정
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    deviceRef.current = device;
    return device;
  }

  /**
   * Colyseus 메시지를 구독해 화면공유 시작/종료를 처리한다.
   * room이 바뀔 때마다 재등록 (useEffect 의존성: [room])
   */
  useEffect(() => {
    if (!room) return;

    // 다른 사람이 화면공유를 시작했을 때 → consume(수신)을 설정한다
    room.onMessage<ScreenShareBroadcastPayload>("screenshare-started", async ({ producerId, presenterId, presenterName }) => {
      try {
        const device = await getDevice(room.roomId);

        // 수신용 transport 생성
        const transportRes = await fetch(`${SERVER_HTTP_URL}/ms/transport/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: room.roomId, direction: "recv" }),
        });
        const transportParams = await transportRes.json();

        const recvTransport = device.createRecvTransport(transportParams);

        // DTLS 핸드셰이크: mediasoup 서버와 암호화 채널을 수립
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

        // 발표자의 producer를 consume — 서버가 포워딩할 미디어 스트림을 요청
        const consumeRes = await fetch(`${SERVER_HTTP_URL}/ms/consume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: room.roomId,
            transportId: recvTransport.id,
            producerId,
            rtpCapabilities: device.rtpCapabilities,  // 내가 디코딩 가능한 코덱 목록
          }),
        });
        const consumeParams = await consumeRes.json();
        if (consumeParams.error) {
          console.error("[screenshare] consume error:", consumeParams.error);
          return;
        }

        const consumer = await recvTransport.consume(consumeParams);
        // mediasoup consumer는 초기에 paused 상태 — resume()을 호출해야 스트림이 흐른다
        await consumer.resume();

        // 나중에 cleanup할 수 있도록 ref에 보관
        consumersRef.current.set(presenterId, { consumer, recvTransport });

        // consumer.track을 MediaStream으로 감싸서 <video> srcObject에 연결 가능하게 함
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

    // 발표자가 공유를 중단했을 때 → consumer와 transport를 정리
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

  /**
   * 화면공유 시작:
   * 1. getDisplayMedia()로 화면 캡처 스트림을 가져온다 (브라우저가 화면 선택 UI를 띄움)
   * 2. mediasoup send transport를 생성하고 DTLS 핸드셰이크
   * 3. produce()로 서버에 스트림 전송 시작
   * 4. room.send("screenshare-start")로 다른 클라이언트에게 알림
   */
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

      // DTLS 핸드셰이크
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

      // produce 이벤트: sendTransport.produce() 내부에서 서버에 producer 등록을 요청
      sendTransport.on("produce", async ({ kind, rtpParameters }: any, callback: (p: { id: string }) => void, errback: (e: Error) => void) => {
        try {
          const res = await fetch(`${SERVER_HTTP_URL}/ms/produce`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transportId: sendTransport.id, kind, rtpParameters }),
          });
          const { id } = await res.json();
          callback({ id });  // id를 돌려줘야 produce()가 완료된다
        } catch (e) {
          errback(e as Error);
        }
      });

      const producer = await sendTransport.produce({ track });
      producerRef.current = producer;

      // 다른 클라이언트가 consume할 수 있도록 producerId를 알림
      room.send("screenshare-start", { producerId: producer.id });
      setIsSharing(true);

      // 사용자가 브라우저 내장 UI로 공유를 중단할 때도 정리
      track.onended = () => stopShare();
    } catch (e) {
      console.error("[screenshare] startShare failed:", e);
    }
  }, [room]);

  /** 화면공유 종료: producer와 transport를 닫고 서버에 알린다 */
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
