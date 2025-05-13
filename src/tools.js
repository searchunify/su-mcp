import { initializeSuCoreTools } from "./su-core/index.js";
export const initializeTools = async ({ server, creds }) => {
  console.error("Initializing tools...");
  await initializeSuCoreTools({ server, creds });
};
