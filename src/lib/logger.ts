import path from 'path';
import fs from 'fs';
import winston from 'winston';
import { isProd } from './config';

const logDir = process.env.LOG_DIR ?? path.resolve(process.cwd(), 'logs');
fs.mkdirSync(logDir, { recursive: true });

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
});

if (!isProd) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

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

export function LogSuccess(path: string, message: string) {
  logger.info(message, { ...pathMeta(path), success: true });
}

export function LogInfo(path: string, message: string) {
  logger.info(message, pathMeta(path));
}

export function LogWarning(path: string, message: string) {
  logger.warn(message, pathMeta(path));
}
