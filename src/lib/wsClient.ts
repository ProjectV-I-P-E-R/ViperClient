import { decodeMulti } from "@msgpack/msgpack";

export interface TrackedObject {
  id: string;
  lat: number;
  lon: number;
  altitude: number;
  callsign?: string;
}

export type SnapshotMessage = {
  type: "snapshot" | "snapshot_chunk";
  objects: TrackedObject[];
};

export type DeltaMessage = {
  type: "delta";
  updated: TrackedObject[];
  removed: string[];
};

export type ServerMessage = SnapshotMessage | DeltaMessage;

type MessageHandler = (msg: ServerMessage) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: number | null = null;
  private intentionalDisconnect: boolean = false;

  constructor(url: string) {
    this.url = url;
  }

  public connect() {
    if (this.ws?.readyState === WebSocket.CONNECTING || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.intentionalDisconnect = false;
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      console.log("[WsClient] Connected to", this.url);
      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = async (event) => {
      try {
        let buffer: ArrayBuffer;
        if (event.data instanceof ArrayBuffer) {
            buffer = event.data;
        } else if (event.data instanceof Blob) {
            buffer = await event.data.arrayBuffer();
        } else if (typeof event.data === "string") {
            const payload = JSON.parse(event.data);
            this.handlers.forEach(handler => handler(payload));
            return;
        } else {
            return;
        }

        const view = new Uint8Array(buffer);
        if (view.length === 0) return;

        if (view[0] === 123 || view[0] === 91) {
            const text = new TextDecoder().decode(view);
            const payload = JSON.parse(text);
            this.handlers.forEach(handler => handler(payload));
            return;
        }

        const generator = decodeMulti(buffer);
        for (const item of generator) {
            this.handlers.forEach(handler => handler(item as ServerMessage));
        }

      } catch (err) {
        console.error("[WsClient] Failed to parse message:", err);
      }
    };

    this.ws.onclose = () => {
      if (!this.intentionalDisconnect) {
          console.log("[WsClient] Disconnected. Reconnecting in 5s...");
          this.scheduleReconnect();
      } else {
          console.log("[WsClient] Intentionally disconnected.");
      }
    };

    this.ws.onerror = (err) => {
      console.error("[WsClient] WebSocket error:", err);
    };
  }

  public disconnect() {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer === null) {
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 5000);
    }
  }
}
