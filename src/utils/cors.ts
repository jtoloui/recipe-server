import { CorsOptions } from 'cors';

const reactAppOrigin = process.env.WEB_APP_URI || 'http://localhost:3000';

export const corsOptions: CorsOptions = {
  origin: [reactAppOrigin, `https://${process.env.AWS_COGNITO_DOMAIN}`],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};
