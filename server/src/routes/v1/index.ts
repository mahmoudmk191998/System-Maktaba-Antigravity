import { Router } from 'express';
import { branchesRouter } from './branches.routes.js';
import { categoriesRouter } from './categories.routes.js';
import { deliveryRouter } from './delivery.routes.js';
import { healthRouter } from './health.routes.js';
import { menuRouter } from './menu.routes.js';
import { offersRouter } from './offers.routes.js';
import { ordersRouter } from './orders.routes.js';
import { pricingRouter } from './pricing.routes.js';
import { productsRouter } from './products.routes.js';
import { settingsRouter } from './settings.routes.js';
import { webhooksRouter } from './webhooks.routes.js';
import { adminClientsRouter } from './adminClients.routes.js';
import { adminIntegrationsRouter } from './adminIntegrations.routes.js';
import { adminObservabilityRouter } from './adminObservability.routes.js';
import { developerPlaygroundRouter } from './developerPlayground.routes.js';
import { attendanceRouter } from './attendance.routes.js';
import { notificationsRouter } from './notifications.routes.js';
import { sseRouter } from '../../realtime/sse/sse.routes.js';

export const v1Router = Router();

// Mount Health Route (Public)
v1Router.use('/', healthRouter);

// Mount Catalog, Pricing, Delivery, Offers, Settings, Orders, Webhooks, Admin Clients, Universal Integrations & Attendance Routes
v1Router.use('/', menuRouter);
v1Router.use('/', categoriesRouter);
v1Router.use('/', productsRouter);
v1Router.use('/', branchesRouter);
v1Router.use('/', deliveryRouter);
v1Router.use('/', offersRouter);
v1Router.use('/', settingsRouter);
v1Router.use('/', pricingRouter);
v1Router.use('/', ordersRouter);
v1Router.use('/', webhooksRouter);
v1Router.use('/', adminClientsRouter);
v1Router.use('/', adminIntegrationsRouter);
v1Router.use('/', adminObservabilityRouter);
v1Router.use('/', developerPlaygroundRouter);
v1Router.use('/', attendanceRouter);
v1Router.use('/', notificationsRouter);
v1Router.use('/', sseRouter);
