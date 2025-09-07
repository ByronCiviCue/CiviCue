import { getEnv } from './env.js';

const envConfig = getEnv();
export { getEnv, requireKey } from './env.js';

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
