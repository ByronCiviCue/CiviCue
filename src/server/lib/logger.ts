import pino from 'pino';
import { secrets } from '../../lib/secrets/index.js';

const logger = pino({
  level: secrets.getLogLevel(),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-api-key',
      'res.headers.set-cookie',
      'body.password',
      'body.token'
    ]
  },
  serializers: {
    req: (req) => {
      if (!req) return req;
      
      const headers = req.headers || {};
      const sensitive = new Set(['authorization', 'cookie', 'x-api-key']);
      const filteredHeaders = Object.fromEntries(
        Object.entries(headers)
          .map(([k, v]) => [String(k).toLowerCase(), v])
          .filter(([k]) => !sensitive.has(String(k)))
      );

      return {
        method: req.method,
        url: req.url,
        remoteAddress: req.socket?.remoteAddress ?? req.connection?.remoteAddress,
        headers: filteredHeaders
      };
    },
    res: (res) => {
      if (!res) return res;
      
      const result: { statusCode?: number; 'content-length'?: string } = { statusCode: res.statusCode };
      const cl = typeof res.getHeader === 'function' ? res.getHeader('content-length') : res.headers?.['content-length'];
      if (cl != null) result['content-length'] = String(cl);
      return result;
    }
  }
});

export { logger };