const reactAppOrigin = 'https://localhost:3000';

export const corsOptions = {
  origin: reactAppOrigin,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};
