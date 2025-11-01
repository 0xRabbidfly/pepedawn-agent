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

// Health monitoring removed - bot uses logger (not console.log) so heartbeat was always stale
// Caused false positive "unresponsive" warnings even when bot was working fine

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
