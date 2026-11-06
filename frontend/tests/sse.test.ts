import { describe, expect, it } from 'vitest';
import { readSSE } from '@/lib/api';

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)));
      c.close();
    },
  });
}

describe('readSSE', () => {
  it('parses events split across network chunks and ignores comments', async () => {
    const events: [string, unknown][] = [];
    await readSSE(
      streamOf(['event: meta\ndata: {"a":1}\n\n: ping\n\nevent: del', 'ta\ndata: {"text":"Hel"}\n\nevent: delta\ndata: {"text":"lo"}\n', '\nevent: done\ndata: {"ok":true}\n\n']),
      {
        meta: (d) => events.push(['meta', d]),
        delta: (d) => events.push(['delta', d]),
        done: (d) => events.push(['done', d]),
      },
    );
    expect(events).toEqual([
      ['meta', { a: 1 }],
      ['delta', { text: 'Hel' }],
      ['delta', { text: 'lo' }],
      ['done', { ok: true }],
    ]);
  });
});
