// src/server.js
const config = require('./config');
const migrate = require('./db/migrate');
const createApp = require('./app');
const { startReminderLoop } = require('./services/reminderJob');

migrate();

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[server] Healthcare Appointment System listening on port ${config.port} (${config.env})`);
  console.log(`[server] SMS dry-run mode: ${config.twilio.dryRun}`);
});

const reminderHandle = startReminderLoop(60_000);

function shutdown() {
  console.log('[server] Shutting down...');
  clearInterval(reminderHandle);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
