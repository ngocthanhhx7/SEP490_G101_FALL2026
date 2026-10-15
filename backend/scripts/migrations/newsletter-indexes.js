import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { newsletterModel } from '../../src/models/newsletter-request.model.js';
const connection = await connectDatabase(loadConfig());
try { await newsletterModel(connection).createIndexes(); console.log('Newsletter indexes ready'); }
finally { await connection.close(); }
