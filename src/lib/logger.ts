import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console()],
});

const pathMeta = (path: string) => ({ path });

export function LogError(
  path: string,
  method: string,
  endpoint: string,
  error: unknown
) {
  logger.error('Request error', {
    ...pathMeta(path),
    method,
    endpoint,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: error instanceof Error ? error.stack : undefined,
  });
}

export function LogWarning(path: string, message: string) {
  logger.warn(message, pathMeta(path));
}
