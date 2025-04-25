import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { SearchUnifyRestClient } from "su-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validates that the provided value is a valid file path, the file exists, and loads the JSON content.
 * @param {string} filePath - The file path to validate.
 * @returns {Object} - The parsed JSON content of the file.
 * @throws {Error} - If the file path is invalid, the file does not exist, or the content is not valid JSON.
 */
function validateAndLoadJSON(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid parameter: filePath must be a non-empty string.');
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File does not exist at path: ${absolutePath}`);
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf-8');

  try {
    return JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Invalid JSON content in file: ${absolutePath}`);
  }
}

const validateCreds = () => {
  console.error ('Validating creds...');
  const credsPath = path.join(__dirname, 'input', 'creds.json');
  const config = validateAndLoadJSON(credsPath);
  if(!config.uid){
    throw new Error('Invalid parameter: uid is required in the config file.');
  }
  const restClientConfig = { ...config };
  delete restClientConfig.uid;
  const suRestClient = new SearchUnifyRestClient(restClientConfig);
  console.error ('created sdk connection...');
  return {
    suRestClient,
    config
  }
}

export { validateCreds };
