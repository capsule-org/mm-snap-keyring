/**
 * The snap origin to use.
 * Will default to the local hosted snap if no value is provided in environment.
 */
export const defaultSnapOrigin =
  process.env.SNAP_ORIGIN ?? `local:http://localhost:8081`;

export const hideReconnectButton = process.env.GATSBY_HIDE_RECONNECT === 'true';

export const paraApiKey = process.env.PARA_API_KEY;

export const paraEnv = process.env.PARA_ENV;
