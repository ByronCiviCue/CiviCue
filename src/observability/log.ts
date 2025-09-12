export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogger {
  debug?(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export class ObservabilityLogger implements StructuredLogger {
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(
    private baseLogger: StructuredLogger,
    private logLevel: LogLevel = 'info',
    private enabled = true
  ) {}

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    
    let currentPriority: number;
    switch (this.logLevel) {
      case 'debug': currentPriority = 0; break;
      case 'info': currentPriority = 1; break;
      case 'warn': currentPriority = 2; break;
      case 'error': currentPriority = 3; break;
      default: currentPriority = 1;
    }
    
    let requestedPriority: number;
    switch (level) {
      case 'debug': requestedPriority = 0; break;
      case 'info': requestedPriority = 1; break;
      case 'warn': requestedPriority = 2; break;
      case 'error': requestedPriority = 3; break;
      default: requestedPriority = 1;
    }
    
    return requestedPriority >= currentPriority;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug') && this.baseLogger.debug) {
      this.baseLogger.debug(message, context);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.baseLogger.info(message, context);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.baseLogger.warn(message, context);
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      this.baseLogger.error(message, context);
    }
  }
}

export function createObservabilityLogger(
  baseLogger: StructuredLogger,
  logLevel: LogLevel = 'info',
  enabled = true
): StructuredLogger {
  return new ObservabilityLogger(baseLogger, logLevel, enabled);
}