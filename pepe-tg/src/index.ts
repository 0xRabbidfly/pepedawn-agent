import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import starterPlugin from './plugin.ts';
import { character } from './pepedawn.ts';
import { fakeRaresPlugin } from './plugins/fakeRaresPlugin';
import { marketTransactionReporterPlugin } from './plugins/marketTransactionReporterPlugin';

// Global error handlers to prevent bot hanging
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, '🚨 [UNHANDLED REJECTION]');
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, '🚨 [UNCAUGHT EXCEPTION]');
  // Don't exit the process, just log the error
});

// Health monitoring to detect zombie state
let lastHeartbeat = Date.now();
const HEARTBEAT_INTERVAL = process.env.NODE_ENV === 'production' ? 300000 : 60000; // 5min prod, 60s dev
const MAX_SILENCE_TIME = process.env.NODE_ENV === 'production' ? 600000 : 180000; // 10min prod, 3min dev
const LOG_HEARTBEAT = process.env.NODE_ENV === 'production'; // Only log in production

// Heartbeat function - silent in dev, visible in prod
setInterval(() => {
  const now = Date.now();
  const timeSinceLastHeartbeat = now - lastHeartbeat;
  
  if (timeSinceLastHeartbeat > MAX_SILENCE_TIME) {
    logger.error({ timeSinceLastHeartbeat: Math.round(timeSinceLastHeartbeat / 1000) }, '🚨 [HEALTH CHECK] Bot appears unresponsive');
    logger.error('🚨 [HEALTH CHECK] Consider restarting the bot manually');
  }
  
  if (LOG_HEARTBEAT) {
    logger.info(`💓 [HEARTBEAT] Bot is alive - ${new Date().toISOString()}`);
  }
  // DON'T update lastHeartbeat here - only actual activity should update it
}, HEARTBEAT_INTERVAL);

// Update heartbeat on any activity
const originalLog = console.log;
console.log = (...args) => {
  lastHeartbeat = Date.now();
  return originalLog.apply(console, args);
};

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing PEPEDAWN character');
  logger.info({ name: character.name }, 'Name:');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [fakeRaresPlugin, marketTransactionReporterPlugin], // Custom Fake Rares plugin for /f command + Market Transaction Reporter
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './pepedawn.ts';

export default project;
