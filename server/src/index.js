import { createApp } from './app.js';

const { app, ctx, close } = createApp();
const { config } = ctx;

const server = app.listen(config.port, () => {
  console.log(`Kampung Watch running at http://localhost:${config.port}`);
  console.log(`Data stored in ${config.dataDir}`);
  if (config.usingDefaultCode) {
    console.warn('WARNING: Using the default volunteer code "kampung2026". Set VOLUNTEER_CODE in server/.env before sharing the site.');
  }
  if (config.autoReply) console.log('Simulated volunteer replies are ON (set AUTO_REPLY=false to disable).');
  console.log(config.assistantEnabled
    ? `AI assistant is ON (${config.aiProvider}, model ${config.assistantModel}, up to ${config.assistantDailyLimit} replies a day).`
    : 'AI assistant is OFF. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to server/.env and restart to turn it on.');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nERROR: Port ${config.port} is already in use. Another program (or another copy of this server) is using it.`);
    console.error('  Close that program, or start on a different port, e.g. in PowerShell:');
    console.error('    $env:PORT=3001; npm start\n');
  } else {
    console.error(err);
  }
  close();
  process.exit(1);
});

function shutdown() {
  console.log('Shutting down…');
  close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
