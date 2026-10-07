/* Server-Sent Events hub: pushes live updates (new reports, verified scam
   waves, case replies, new comments) to every open browser tab. */
export function createHub() {
  const clients = new Set();

  return {
    connect(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write('retry: 3000\n\n');
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
      const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const c of clients) if (filter(c)) c.res.write(msg);
    },

    volunteersOnline() {
      return new Set([...clients].filter(c => c.volunteer).map(c => c.volunteer.tokenHash)).size;
    },

    closeAll() {
      for (const c of clients) c.res.end();
      clients.clear();
    }
  };
}
