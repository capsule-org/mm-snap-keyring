import { KeyringRpcMethod } from '@metamask/keyring-api';

import { Environment } from './definitions';

export enum InternalMethod {
  ToggleSyncApprovals = 'snap.internal.toggleSynchronousApprovals',
  IsSynchronousMode = 'snap.internal.isSynchronousMode',
}

const getOriginUrl = () => {
  switch (process.env.DAPP_ENV) {
    case Environment.SANDBOX:
      return process.env.DAPP_ORIGIN_SANDBOX as string;
    case Environment.BETA:
      return process.env.DAPP_ORIGIN_BETA as string;
    case Environment.PROD:
      return process.env.DAPP_ORIGIN_PRODUCTION as string;
    default:
      return process.env.DAPP_ORIGIN_DEVELOPMENT as string;
  }
};

export const originPermissions = new Map<string, string[]>();

export const initializePermissions = () => {
  const originUrl = getOriginUrl();

  originPermissions.set('metamask', [
    // Keyring methods
    KeyringRpcMethod.ListAccounts,
    KeyringRpcMethod.GetAccount,
    KeyringRpcMethod.FilterAccountChains,
    KeyringRpcMethod.DeleteAccount,
    KeyringRpcMethod.ListRequests,
    KeyringRpcMethod.GetRequest,
    KeyringRpcMethod.SubmitRequest,
    KeyringRpcMethod.RejectRequest,
  ]);
  originPermissions.set(originUrl.substring(0, originUrl.length - 1), [
    // Keyring methods
    KeyringRpcMethod.ListAccounts,
    KeyringRpcMethod.GetAccount,
    KeyringRpcMethod.CreateAccount,
    KeyringRpcMethod.FilterAccountChains,
    KeyringRpcMethod.UpdateAccount,
    KeyringRpcMethod.DeleteAccount,
    KeyringRpcMethod.ExportAccount,
    KeyringRpcMethod.ListRequests,
    KeyringRpcMethod.GetRequest,
    KeyringRpcMethod.ApproveRequest,
    KeyringRpcMethod.RejectRequest,
    // Custom methods
    InternalMethod.ToggleSyncApprovals,
    InternalMethod.IsSynchronousMode,
  ]);
};
