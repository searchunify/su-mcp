import { initializeSearchTools } from './su-core-search.js';

export const initializeSuCoreTools = async ({ server, creds }) => {
  console.error("Initializing suCore tools...");
  await initializeSearchTools({ server, creds });
};
