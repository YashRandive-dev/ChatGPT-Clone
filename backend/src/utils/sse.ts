import type { Response } from 'express';

/** Server-Sent Events writer with keep-alive pings and disconnect awareness. */
export class SSEStream {
  private heartbeat: NodeJS.Timeout;
  closed = false;

  constructor(private res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx, Render)
    res.flushHeaders();
    this.heartbeat = setInterval(() => this.comment('ping'), 15000);
    res.on('close', () => {
      this.closed = true;
      clearInterval(this.heartbeat);
    });
  }

  send(event: string, data: unknown) {
    if (this.closed) return;
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  comment(text: string) {
    if (!this.closed) this.res.write(`: ${text}\n\n`);
  }

  end() {
    clearInterval(this.heartbeat);
    if (!this.closed) this.res.end();
    this.closed = true;
  }
}
