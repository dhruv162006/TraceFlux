import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'node:http';
import { WsMessage } from '@traceflux/instrumentation';

export class WsServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      
      const wsClient = ws as any;
      wsClient.isAlive = true;

      ws.on('pong', () => {
        wsClient.isAlive = true;
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });

    this.startPingInterval();
  }

  public broadcast(msg: WsMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  public onConnection(cb: (ws: WebSocket) => void): void {
    this.wss.on('connection', cb);
  }

  public close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.wss.close();
    this.clients.clear();
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const client of this.clients) {
        const wsClient = client as any;
        if (wsClient.isAlive === false) {
          this.clients.delete(client);
          client.terminate();
          continue;
        }

        wsClient.isAlive = false;
        client.ping();

        // Setup check for pong response within 10 seconds
        const timeout = setTimeout(() => {
          if (wsClient.isAlive === false && this.clients.has(client)) {
            this.clients.delete(client);
            client.terminate();
          }
        }, 10000);

        if (timeout.unref) {
          timeout.unref();
        }
      }
    }, 30000);

    if (this.pingInterval.unref) {
      this.pingInterval.unref();
    }
  }
}
