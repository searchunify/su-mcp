import { initializeSearchTools } from './su-core-search.js';
import { initializeAnalyticsTools } from './su-core-analytics.js';
import { initializeSearchClientsTools } from './su-core-search-clients.js';

export const initializeSuCoreTools = async ({ server, creds, getCreds }) => {
  console.error("Initializing suCore tools...");
  await initializeSearchTools({ server, creds, getCreds });
  await initializeAnalyticsTools({ server, creds, getCreds });
  await initializeSearchClientsTools({ server, creds, getCreds });
};
