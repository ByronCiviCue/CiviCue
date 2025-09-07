# Platform Keys & Tokens

Use these direct links to generate credentials. Add values to `.env` using the placeholders in `.env.example`.

Socrata
- Generate App Tokens / API Keys: https://support.socrata.com/hc/en-us/articles/210138558-Generating-App-Tokens-and-API-Keys
- App Token docs: https://dev.socrata.com/docs/app-tokens.html
- Create a Tyler Data & Insights account: https://support.socrata.com/hc/en-us/articles/115004055807-How-to-Sign-Up-for-a-Tyler-Data-Insights-ID
- Env: `SOCRATA_APP_ID` (global), optional per‑domain overrides like `SFDATA_APP_ID` if needed

ArcGIS
- Create an API key: https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/tutorials/create-an-api-key/
- How to use API keys: https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/how-to-use-an-api-key/
- Manage keys: https://developers.arcgis.com/documentation/security-and-authentication/api-key-authentication/tutorials/manage-api-key-credentials/
- Env: `ARCGIS_PORTAL_URL`, `ARCGIS_API_KEY`, or OAuth `ARCGIS_CLIENT_ID`/`ARCGIS_CLIENT_SECRET` (token at `ARCGIS_OAUTH_TOKEN_URL`)

CKAN
- Token UX varies by portal; typically User Profile → API Tokens. Reference: https://docs.ckan.org/en/2.9/api.html
- Env: `CKAN_BASE_URL`, `CKAN_API_KEY`, optional `CKAN_ORG`, `CKAN_VERIFY_SSL`

Notes
- Public reads often work without keys. Set tokens to access org/private datasets and raise rate limits.
- Builders are hash‑aware; credentials only affect fetch, not file churn.
