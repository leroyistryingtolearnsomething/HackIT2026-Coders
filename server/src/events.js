/* Live updates (new reports, verified scam waves, case replies, Pause alerts…).
   Pushed to every open browser tab with Server-Sent Events. Some networks and
   tunnels hold a streaming response back, so recent events are also kept for a
   few minutes and can be fetched with since() — the browser falls back to that
   when the stream stays silent. */
const KEEP_MS = 10 * 60_000;
const KEEP_MAX = 1000;

export function createHub() {
  const clients = new Set();
  const recent = []; // { id, event, data, filter, at }
  let lastId = 0;

  return {
    connect(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write('retry: 3000\n\n');
      // Lets the browser know the stream really works (if this never arrives, it polls instead).
      res.write(`event: ready\ndata: ${JSON.stringify({ last: lastId })}\n\n`);
      const client = { res, clientId: req.clientId, volunteer: req.volunteer };
      clients.add(client);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(client);
      });
    },

    /* filter(client) decides who receives the event; everyone by default. */
    send(event, data, filter = () => true) {
      const id = ++lastId;
      const now = Date.now();
      recent.push({ id, event, data, filter, at: now });
      while (recent.length > KEEP_MAX || (recent.length && now - recent[0].at > KEEP_MS)) recent.shift();
      const msg = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const c of clients) if (filter(c)) c.res.write(msg);
    },

    /* Events after `after` that this reader is allowed to see (for polling). */
    since(after, reader) {
      return {
        last: lastId,
        events: recent.filter(e => e.id > after && e.filter(reader)).map(({ id, event, data }) => ({ id, event, data }))
      };
    },

    lastId: () => lastId,

    volunteersOnline() {
      return new Set([...clients].filter(c => c.volunteer).map(c => c.volunteer.tokenHash)).size;
    },

    closeAll() {
      for (const c of clients) c.res.end();
      clients.clear();
    }
  };
}
