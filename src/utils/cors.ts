const reactAppOrigin = process.env.WEB_APP_URI || 'http://localhost:3000';

export const corsOptions = {
  origin: reactAppOrigin,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};
