import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';

export type KeyringState = {
  pendingRequests: KeyringRequest[];
  accounts: KeyringAccount[];
  useSynchronousApprovals: boolean;
};
