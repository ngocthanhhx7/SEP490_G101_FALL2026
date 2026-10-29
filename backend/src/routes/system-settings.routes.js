import { privateResponse } from '../middlewares/private-response.js';
import { createSystemSettingsController } from '../controllers/system-settings.controller.js';
import { Router } from 'express';
import {
  requireCsrf,
  requireRoles,
  requireSession
} from '../middlewares/session.js';
import { systemSettingVersionModel } from '../models/system-setting-version.model.js';
import { systemSettingAuditModel } from '../models/system-setting-audit.model.js';
import { createSessionService } from '../services/session.service.js';
import { createSystemSettingsService } from '../services/system-settings.service.js';

export function systemSettingsModule({
  config,
  connection,
  sessionService: suppliedSessionService,
  clock = Date.now
} = {}) {
  if (!config || !connection)
    throw new TypeError('System settings dependencies are required');
  const service = createSystemSettingsService({
    connection,
    SettingVersion: systemSettingVersionModel(connection),
    Audit: systemSettingAuditModel(connection),
    clock
  });
  const router = Router();

  if (config.auth?.enabled) {
    const sessionService =
      suppliedSessionService ??
      createSessionService({
        connection,
        tokenSecret: config.auth.tokenSecret,
        csrfSecret: config.auth.csrfSecret
      });
    const staff = [
      privateResponse,
      requireSession(sessionService, { clock }),
      requireRoles('STAFF')
    ];
    const admin = [
      privateResponse,
      requireSession(sessionService, { clock }),
      requireRoles('ADMIN')
    ];
    const csrf = requireCsrf(sessionService);
    router.get(
      '/service-catalog',
      ...staff,
      createSystemSettingsController({ service }).getServiceCatalog
    );
    router.post(
      '/service-catalog/visibility',
      ...admin,
      csrf,
      createSystemSettingsController({ service }).createServiceCatalogVisibility
    );
  }

  return {
    name: 'system-settings',
    mount: '/api/v1/system-settings',
    router,
    catalogSettings: service.catalogSettings,
    settings: service
  };
}
