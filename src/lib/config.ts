import { env as envConfig } from './env';

export { env, requireKey } from './env';

export const SOCRATA_HEADERS = {
  'X-App-Token': envConfig.socrata.appId,
  'Accept': 'application/json',
};

export const CKAN_HEADERS = envConfig.ckan.apiKey 
  ? {
      'X-CKAN-API-Key': envConfig.ckan.apiKey,
      'Accept': 'application/json',
    }
  : {
      'Accept': 'application/json',
    };

export const ARCGIS_CONFIG = {
  portalUrl: envConfig.arcgis.portalUrl || 'https://www.arcgis.com',
  headers: envConfig.arcgis.apiKey
    ? {
        'Authorization': `Bearer ${envConfig.arcgis.apiKey}`,
        'Accept': 'application/json',
      }
    : {
        'Accept': 'application/json',
      },
};