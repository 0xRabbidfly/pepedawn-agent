import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import starterPlugin from './plugin.ts';
import { character } from './pepedawn.ts';
import { fakeRaresPlugin } from './plugins/fakeRaresPlugin';

// Global error handlers to prevent bot hanging
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 [UNHANDLED REJECTION]', reason);
  console.error('Promise:', promise);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('🚨 [UNCAUGHT EXCEPTION]', error);
  // Don't exit the process, just log the error
});

// Health monitoring to detect zombie state
let lastHeartbeat = Date.now();
const HEARTBEAT_INTERVAL = process.env.NODE_ENV === 'production' ? 30000 : 60000; // 30s prod, 60s dev
const MAX_SILENCE_TIME = 120000; // 2 minutes
const LOG_HEARTBEAT = process.env.NODE_ENV === 'production'; // Only log in production

// Heartbeat function - silent in dev, visible in prod
setInterval(() => {
  const now = Date.now();
  const timeSinceLastHeartbeat = now - lastHeartbeat;
  
  if (timeSinceLastHeartbeat > MAX_SILENCE_TIME) {
    console.error('🚨 [HEALTH CHECK] Bot appears unresponsive - no activity for', Math.round(timeSinceLastHeartbeat / 1000), 'seconds');
    console.error('🚨 [HEALTH CHECK] Consider restarting the bot manually');
  }
  
  if (LOG_HEARTBEAT) {
    console.log(`💓 [HEARTBEAT] Bot is alive - ${new Date().toISOString()}`);
  }
  lastHeartbeat = now;
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
  plugins: [fakeRaresPlugin], // Custom Fake Rares plugin for /f command
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './pepedawn.ts';

export default project;
