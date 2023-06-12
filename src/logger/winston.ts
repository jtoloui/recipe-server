import winston from 'winston';

// Create a Winston logger instance
const logger = (logLvl: string, label: string = 'Route') =>
  winston.createLogger({
    level: logLvl,
    format: winston.format.combine(
      winston.format.colorize(), // Add this line to enable colorization
      winston.format.timestamp(),
      winston.format.label({ label }),
      winston.format.printf(({ timestamp, level, message, label }) => {
        return `${timestamp} [Recipe Api - ${label}] ${level}: ${message}`;
      })
    ),
    transports: [new winston.transports.Console()],
  });

export default logger;
