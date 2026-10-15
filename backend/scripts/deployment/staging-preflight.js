import { validateStagingEnvironment } from '../../src/config/staging-preflight.js';

try {
  console.log(JSON.stringify(validateStagingEnvironment(process.env)));
} catch (error) {
  // Never serialize input, driver/provider errors, URI, secret or stack.
  console.log(JSON.stringify({ status: 'INVALID_CONFIGURATION',
    fields: error.name === 'ConfigurationError' ? error.fields : [],
    deploymentVerified: false }));
  process.exitCode = 1;
}
