import { initializeSuCoreTools } from "./su-core/index.js";
export const initializeTools = async ({ server, creds, getCreds }) => {
  console.error("Initializing tools...");
  await initializeSuCoreTools({ server, creds, getCreds });
};
