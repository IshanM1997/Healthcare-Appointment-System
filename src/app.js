// src/app.js
const express = require('express');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(express.json());

  // Trust the first proxy hop so req.ip is meaningful behind e.g. nginx;
  // harmless for local/dev usage too.
  app.set('trust proxy', 1);

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
