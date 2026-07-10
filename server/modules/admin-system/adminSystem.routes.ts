import express from 'express';
import {
  listAdminsHandler,
  createAdminHandler,
  updateAdminHandler,
  resetAdminPasswordHandler,
  getAdminSessionsHandler,
  revokeAdminSessionsHandler,
  listMySessionsHandler,
  listAllSessionsHandler,
  revokeSessionHandler,
  adminAuditLogHandler,
  changeOwnPasswordHandler,
  adminOverviewHandler,
} from './adminSystem.controller.js';

export const adminSystemRouter = express.Router();

// Admin CRUD
adminSystemRouter.get('/admins', listAdminsHandler);
adminSystemRouter.post('/admins', createAdminHandler);
adminSystemRouter.patch('/admins/:id', updateAdminHandler);
adminSystemRouter.post('/admins/:id/reset-password', resetAdminPasswordHandler);
adminSystemRouter.get('/admins/:id/sessions', getAdminSessionsHandler);
adminSystemRouter.delete('/admins/:id/sessions', revokeAdminSessionsHandler);

// Sessions
adminSystemRouter.get('/sessions', listMySessionsHandler);
adminSystemRouter.get('/sessions/all', listAllSessionsHandler);
adminSystemRouter.delete('/sessions/:sessionId', revokeSessionHandler);

// Audit log
adminSystemRouter.get('/admin-audit', adminAuditLogHandler);

// Own password change
adminSystemRouter.post('/change-password', changeOwnPasswordHandler);

// Overview
adminSystemRouter.get('/admin-overview', adminOverviewHandler);
