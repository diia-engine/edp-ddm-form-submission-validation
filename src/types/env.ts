export type EnvConfig = Partial<{
  NODE_ENV: string;
  PORT: `${number}`;
  API_GLOBAL_PREFIX: string;
  SWAGGER_DISABLE: `${boolean}`;
  SWAGGER_PATH: string;
  SWAGGER_TITLE: string;
  SWAGGER_DESCRIPTION: string;
  ENABLE_SHUTDOWN_HOOKS: `${boolean}`;
  FORM_PROVIDER_BASE_URL: string;
  USE_MOCKED_FORM_PROVIDER: `${boolean}`;
  REQUEST_BODY_LIMIT: string;
  LANGUAGE: string;
  WORKER_MIN_POOL_SIZE?: `${number}`;
  WORKER_MAX_POOL_SIZE?: `${number}`;
  WORKER_TIMEOUT_MS?: `${number}`;
}>;
