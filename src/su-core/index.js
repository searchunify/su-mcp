import { initializeSearchTools } from './su-core-search.js';
import { initializeAnalyticsTools } from './su-core-analytics.js';

export const initializeSuCoreTools = async ({ server, creds }) => {
  console.error("Initializing suCore tools...");
  // await initializeSearchTools({ server, creds });
  await initializeAnalyticsTools({ server, creds });
};
