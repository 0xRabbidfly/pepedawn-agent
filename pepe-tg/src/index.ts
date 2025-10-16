import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import starterPlugin from './plugin.ts';
import { character } from './pepedawn.ts';

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing PEPEDAWN character');
  logger.info({ name: character.name }, 'Name:');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  // plugins: [starterPlugin], <-- Import custom plugins here
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './pepedawn.ts';

export default project;
