import { describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import express from 'express';
import request from 'supertest';
import { createAdmissionMiddleware, createMediaAdmission, parseBody } from '../../src/routes/private-image.routes.js';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function appFor(work, admission = createMediaAdmission({ limit: 1 })) {
  const app = express();
  app.post('/upload', createAdmissionMiddleware({ admission, work }));
  app.get('/download', createAdmissionMiddleware({ admission, work }));
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ code: error.code ?? 'ERROR' }));
  return { app, admission };
}

describe('private-image route resource admission', () => {
  test('reserves capacity before a slow raw-body parser and releases after parser errors', async () => {
    const parser = express.raw({ type: 'image/png', limit: 4 });
    let parsed = 0;
    let started;
    const startedPromise = new Promise(resolve => { started = resolve; });
    const { app, admission } = appFor(async (req, res) => {
      await parseBody(parser, req, res);
      parsed += 1;
      started();
      await wait(25);
      res.sendStatus(204);
    });
    const first = request(app).post('/upload').set('Content-Type', 'image/png').send(Buffer.from('1234')).then(response => response);
    await startedPromise;
    await request(app).post('/upload').set('Content-Type', 'image/png').send(Buffer.from('1234')).expect(503);
    await expect(first).resolves.toMatchObject({ status: 204 });
    expect(parsed).toBe(1);
    await request(app).post('/upload').set('Content-Type', 'image/png').send(Buffer.from('12345')).expect(413);
    expect(admission.active).toBe(0);
    await request(app).post('/upload').set('Content-Type', 'image/png').send(Buffer.from('ok')).expect(204);
    expect(admission.active).toBe(0);
  });

  test('holds a download slot while response bytes are still buffered and releases once', async () => {
    const admission = createMediaAdmission({ limit: 1 });
    const res = new EventEmitter();
    res.headersSent = false;
    res.write = () => { res.headersSent = true; };
    res.end = () => res.emit('finish');
    let finishWork;
    const work = async (_req, response) => {
      response.write('private-bytes');
      await new Promise(resolve => { finishWork = resolve; });
      response.end();
    };
    const middleware = createAdmissionMiddleware({ admission, work });
    const next = jest.fn();
    middleware({}, res, next);
    await wait(5);
    expect(admission.active).toBe(1);
    res.emit('close');
    expect(admission.active).toBe(1);
    const blockedNext = jest.fn();
    middleware({}, new EventEmitter(), blockedNext);
    expect(blockedNext.mock.calls[0][0]).toMatchObject({ code: 'MEDIA_BUSY' });
    finishWork();
    await wait(5);
    expect(admission.active).toBe(0);
    expect(next).not.toHaveBeenCalled();
  });

  test('release is idempotent when an abort/close and completion race', () => {
    const admission = createMediaAdmission({ limit: 1 });
    const lease = admission.tryAcquire();
    expect(admission.active).toBe(1);
    lease.release();
    lease.release();
    expect(admission.active).toBe(0);
    expect(admission.tryAcquire()).not.toBeNull();
  });
});
