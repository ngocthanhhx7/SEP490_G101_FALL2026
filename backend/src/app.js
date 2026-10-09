import express from 'express';
import { config } from './config/env.js';
import { errorHandler } from './errors/error-handler.js';
import { createRegistrationRouter } from './routes/registration-routes.js';
import { createLoginRouter } from './routes/login-routes.js';
import { optionalAuthentication } from './middlewares/optional-authentication.js';
import { createPetSitterApplicationRouter } from './routes/pet-sitter-application-routes.js';

export const app = express();

app.set('trust proxy', config.trustProxy);
app.use(express.json({ limit: '32kb' }));
app.use(optionalAuthentication);

app.get('/health/live', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

app.use('/api/v1/auth/register', createRegistrationRouter());
app.use('/api/v1/auth/login', createLoginRouter());
app.use('/api/v1/pet-sitter/applications', createPetSitterApplicationRouter());
app.use(errorHandler);
