/**
 * The snap origin to use.
 * Will default to the local hosted snap if no value is provided in environment.
 */
export const defaultSnapOrigin =
  process.env.SNAP_ORIGIN ?? `local:http://localhost:8080`;
console.log(process.env.GATSBY_HIDE_RECONNECT);

export const hideReconnectButton = process.env.GATSBY_HIDE_RECONNECT === 'true';
