import { envVars } from "./env";

export const appConfig = {
  jsearch: {
    apiKey: envVars.JSEARCH_API_KEY,
    apiHost: envVars.JSEARCH_API_HOST,
    query: envVars.JSEARCH_QUERY,
    country: envVars.JSEARCH_COUNTRY,
    datePosted: envVars.JSEARCH_DATE_POSTED,
    pages: envVars.JSEARCH_PAGES,
    timezone: envVars.INGESTION_TIMEZONE,
  },
  jsearchApi: {
    host: envVars.JSEARCH_RAPIDAPI_HOST,
    fetchDetails: envVars.JSEARCH_RAPIDAPI_FETCH_DETAILS,
    maxDetailFetches: envVars.JSEARCH_RAPIDAPI_MAX_DETAIL_FETCHES,
  },
  azureOpenAi: {
    endpoint: envVars.AZURE_OPENAI_ENDPOINT,
    apiKey: envVars.AZURE_OPENAI_API_KEY,
    deployment: envVars.AZURE_OPENAI_DEPLOYMENT,
  },
};

export const configService = {
  get<K extends keyof typeof appConfig>(key: K, _opts?: unknown) {
    return appConfig[key];
  },
};
