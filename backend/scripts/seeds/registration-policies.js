import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { publicPolicyVersionModel } from '../../src/models/public-policy-version.model.js';

const sourceRef = 'doc/requirements/registration-terms-privacy-proposal-v1.md';
const source = await readFile(new URL('../../../' + sourceRef, import.meta.url), 'utf8');
const blocks = source.split(/^## /m).slice(1);
if (blocks.length !== 2 || !source.includes('Duyệt hai bản và xuất bản cho đăng ký')) throw new Error('Approved policy source is required');
const policies = blocks.map((block, index) => {
  const [title, ...parts] = block.trim().split(/^### /m);
  const sections = parts.map(part => {
    const [heading, ...body] = part.trim().split('\n');
    return { heading: heading.trim(), paragraphs: body.join('\n').trim().split(/\n\s*\n/).filter(Boolean) };
  });
  const content = { title: title.trim(), sections };
  return { ...content, slug: index === 0 ? 'terms' : 'privacy', versionId: 'registration-2026-10-15-v1',
    purpose: 'Chính sách đã được Leader duyệt cho đăng ký và ứng tuyển Paw World Care.', sourceRef,
    contentHash: createHash('sha256').update(JSON.stringify(content)).digest('hex') };
});
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ state: 'DRY_RUN', policies: policies.map(({ slug, versionId, contentHash }) => ({ slug, versionId, contentHash })) }));
} else {
  let connection;
  try {
    connection = await connectDatabase(loadConfig());
    const Policy = publicPolicyVersionModel(connection);
    await Policy.createIndexes();
    const result = await connection.transaction(async session => {
      const now = new Date();
      const published = [];
      for (const policy of policies) {
        const existing = await Policy.findOne({ slug: policy.slug, versionId: policy.versionId }).session(session).lean();
        if (existing) {
          if (existing.contentHash !== policy.contentHash || existing.status !== 'APPROVED') throw new Error('Existing policy differs; use a new approved version');
          published.push({ slug: policy.slug, state: 'UNCHANGED' });
          continue;
        }
        await Policy.create([{ ...policy, status: 'APPROVED', effectiveAt: now, approvedAt: now,
          approvedBy: 'Nguyễn Ngọc Thành (@ngocthanhhx7)', expiresAt: null }], { session });
        published.push({ slug: policy.slug, state: 'PUBLISHED', effectiveAt: now.toISOString() });
      }
      return published;
    });
    console.log(JSON.stringify({ policies: result }));
  } catch { console.error('Policy publication failed; database details omitted'); process.exitCode = 1; }
  finally { await connection?.close(); }
}
