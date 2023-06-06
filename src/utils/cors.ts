const reactAppOrigin = 'https://api.jamietoloui.com';

export const corsOptions = {
  origin: reactAppOrigin,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};
