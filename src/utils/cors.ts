const reactAppOrigin = 'https://localhost:3000';

export const corsOptions = {
  origin: reactAppOrigin,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true, // Allow cookies to be included in the requests
};
