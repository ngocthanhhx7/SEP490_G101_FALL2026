import mongoose from 'mongoose';
import { parseArgs } from 'node:util';
import { resolve, dirname, sep } from 'node:path';
import { mkdir, access, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createTrainingDatasetExporter } from '../../src/services/ai-training/dataset-export.service.js';

let connection;
try {
  const { values } = parseArgs({ options: { output: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  const key = values.apply ? process.env.AI_TRAINING_EXPORT_SECRET : undefined;
  if (values.apply && (!values.output || typeof key !== 'string' || key.length < 32)) throw new Error('Output and private AI_TRAINING_EXPORT_SECRET (32+ characters) required');
  connection = await mongoose.createConnection(process.env.MONGO_URI, { dbName: process.env.MONGO_DB,
    autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise();
  const result = await createTrainingDatasetExporter({ connection }).collect({ key });
  if (!values.apply) console.log(JSON.stringify({ state: 'DRY_RUN', ...result.summary }));
  else {
    if (!result.summary.readyForTraining) throw new Error('Verified data gates not met; run dry-run for aggregate reasons');
    const root = resolve('storage/ai'), output = resolve(values.output), manifest = output + '.manifest.json';
    if (!output.startsWith(root + sep) || !output.endsWith('.jsonl')) throw new Error('Output must be a new JSONL inside backend/storage/ai');
    for (const path of [output, manifest]) {
      try { await access(path); throw new Error('Output exists; choose a new immutable export'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const bytes = Buffer.from(result.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    if (bytes.length > 50000000) throw new Error('Export exceeds trainer 50 MB bound');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
    await writeFile(manifest, JSON.stringify({ ...result.summary, datasetSha256: createHash('sha256').update(bytes).digest('hex'),
      exportedAt: new Date().toISOString(), featureVersion: 'PWC_MATCH_FEATURES_V1',
      source: 'VERIFIED_CUSTOMER_REVIEW_COMPLETION_AND_MATCH_JOIN', population: 'ACCEPTED_SITTERS_ONLY_SELECTION_BIAS' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ state: 'EXPORTED', ...result.summary, bytes: bytes.length }));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await connection?.close(); }
