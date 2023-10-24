import { Common, Hardfork } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import { stripHexPrefix } from '@ethereumjs/util';
import type { TypedMessage } from '@metamask/eth-sig-util';
import {
  SignTypedDataVersion,
  recoverPersonalSignature,
} from '@metamask/eth-sig-util';
import type {
  Keyring,
  KeyringAccount,
  KeyringRequest,
  SubmitRequestResponse,
} from '@metamask/keyring-api';
import {
  EthAccountType,
  EthMethod,
  emitSnapKeyringEvent,
} from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api/dist/events';
import { type Json, type JsonRpcRequest } from '@metamask/utils';
import type { SuccessfulSignatureRes } from '@usecapsule/web-sdk';
import Capsule, { Environment, CapsuleEthersSigner } from '@usecapsule/web-sdk';
import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import { v4 as uuid } from 'uuid';

import { saveState } from './stateManagement';
import { isEvmChain, serializeTransaction, throwError } from './util';
import packageInfo from '../package.json';

export type KeyringState = {
  wallets: Record<string, Wallet>;
  pendingRequests: Record<string, KeyringRequest>;
  useSyncApprovals: boolean;
  capsuleSessionStorage: Record<string, any>;
  capsuleLocalStorage: Record<string, any>;
};

export type Wallet = {
  account: KeyringAccount;
};

type CreateAccountOptions = {
  userId: string;
  email: string;
  sessionCookie: string;
};

export class SimpleKeyring implements Keyring {
  #state: KeyringState;

  #capsule: Capsule;

  constructor(state: KeyringState) {
    this.#state = state;
    if (!this.#state.capsuleLocalStorage) {
      this.#state.capsuleLocalStorage = {};
    }
    if (!this.#state.capsuleSessionStorage) {
      this.#state.capsuleSessionStorage = {};
    }

    const localStorageGetItemOverride = async (
      key: string,
    ): Promise<string | null> => {
      return this.#state.capsuleLocalStorage[key] ?? null;
    };
    const localStorageSetItemOverride = async (
      key: string,
      value: string,
    ): Promise<void> => {
      this.#state.capsuleLocalStorage[key] = value;
    };
    const sessionStorageGetItemOverride = async (
      key: string,
    ): Promise<string | null> => {
      return this.#state.capsuleSessionStorage[key] ?? null;
    };
    const sessionStorageSetItemOverride = async (
      key: string,
      value: string,
    ): Promise<void> => {
      this.#state.capsuleSessionStorage[key] = value;
    };
    const sessionStorageRemoveItemOverride = async (
      key: string,
    ): Promise<void> => {
      delete this.#state.capsuleSessionStorage[key];
    };
    this.#capsule = new Capsule(
      Environment.SANDBOX,
      '94aa050e49b9acfb8e87b3cad267acd9',
      {
        offloadMPCComputationURL:
          'https://partner-mpc-computation.sandbox.usecapsule.com',
        disableWorkers: true,
        useStorageOverrides: true,
        localStorageGetItemOverride,
        localStorageSetItemOverride,
        sessionStorageGetItemOverride,
        sessionStorageSetItemOverride,
        sessionStorageRemoveItemOverride,
      },
    );
  }

  async #getWalletIdFromAddress(address: string): Promise<string> {
    await this.#capsule.init();
    const wallets = this.#capsule.getWallets();
    const currentWallet = Object.values(wallets).find(
      (wallet) => wallet.address === address,
    );
    return currentWallet!.id;
  }

  async listAccounts(): Promise<KeyringAccount[]> {
    console.log(this.#capsule.getWallets());
    return Object.values(this.#state.wallets).map((wallet) => wallet.account);
  }

  async getAccount(id: string): Promise<KeyringAccount> {
    return (
      this.#state.wallets[id]?.account ??
      throwError(`Account '${id}' not found`)
    );
  }

  async createAccount(options: CreateAccountOptions): Promise<KeyringAccount> {
    await this.#capsule.init();

    await this.#capsule.setUserId(options.userId);
    await this.#capsule.setEmail(options.email);
    this.#capsule.persistSessionCookie(options.sessionCookie);
    const newWallet = (await this.#capsule.createWallet(false, () => {}))[0];

    const account: KeyringAccount = {
      id: uuid(),
      options,
      address: newWallet.address as string,
      methods: [
        EthMethod.PersonalSign,
        EthMethod.Sign,
        EthMethod.SignTransaction,
        EthMethod.SignTypedDataV1,
        EthMethod.SignTypedDataV3,
        EthMethod.SignTypedDataV4,
      ],
      type: EthAccountType.Eoa,
    };
    await this.#emitEvent(KeyringEvent.AccountCreated, { account });

    this.#state.wallets[account.id] = { account };
    await this.#saveState();
    return account;
  }

  async filterAccountChains(_id: string, chains: string[]): Promise<string[]> {
    // The `id` argument is not used because all accounts created by this snap
    // are expected to be compatible with any EVM chain.
    return chains.filter((chain) => isEvmChain(chain));
  }

  async updateAccount(account: KeyringAccount): Promise<void> {
    const wallet =
      this.#state.wallets[account.id] ??
      throwError(`Account '${account.id}' not found`);

    const newAccount: KeyringAccount = {
      ...wallet.account,
      ...account,
      // Restore read-only properties.
      address: wallet.account.address,
    };

    try {
      await this.#emitEvent(KeyringEvent.AccountUpdated, {
        account: newAccount,
      });
      wallet.account = newAccount;
      await this.#saveState();
    } catch (error) {
      throwError((error as Error).message);
    }
  }

  // TODO: delete wallet from localstorage too
  async deleteAccount(id: string): Promise<void> {
    try {
      await this.#emitEvent(KeyringEvent.AccountDeleted, { id });
      delete this.#state.wallets[id];
      await this.#saveState();
    } catch (error) {
      throwError((error as Error).message);
    }
  }

  async listRequests(): Promise<KeyringRequest[]> {
    return Object.values(this.#state.pendingRequests);
  }

  async getRequest(id: string): Promise<KeyringRequest> {
    return (
      this.#state.pendingRequests[id] ?? throwError(`Request '${id}' not found`)
    );
  }

  async submitRequest(request: KeyringRequest): Promise<SubmitRequestResponse> {
    await this.#capsule.init();

    if (!(await this.#capsule.isFullyLoggedIn())) {
      return this.#asyncSubmitRequest(request);
    }
    return this.#state.useSyncApprovals
      ? this.#syncSubmitRequest(request)
      : this.#asyncSubmitRequest(request);
  }

  async approveRequest(id: string): Promise<void> {
    const { request } =
      this.#state.pendingRequests[id] ??
      throwError(`Request '${id}' not found`);

    const result = await this.#handleSigningRequest(
      request.method,
      request.params ?? [],
    );

    await this.#removePendingRequest(id);
    await this.#emitEvent(KeyringEvent.RequestApproved, { id, result });
  }

  async rejectRequest(id: string): Promise<void> {
    if (this.#state.pendingRequests[id] === undefined) {
      throw new Error(`Request '${id}' not found`);
    }

    await this.#removePendingRequest(id);
    await this.#emitEvent(KeyringEvent.RequestRejected, { id });
  }

  async #removePendingRequest(id: string): Promise<void> {
    delete this.#state.pendingRequests[id];
    await this.#saveState();
  }

  #getCurrentUrl(): string {
    const dappUrlPrefix =
      process.env.NODE_ENV === 'production'
        ? process.env.DAPP_ORIGIN_PRODUCTION
        : process.env.DAPP_ORIGIN_DEVELOPMENT;
    const dappVersion: string = packageInfo.version;

    // Ensuring that both dappUrlPrefix and dappVersion are truthy
    if (dappUrlPrefix && dappVersion && process.env.NODE_ENV === 'production') {
      return `${dappUrlPrefix}${dappVersion}/`;
    }
    // Default URL if dappUrlPrefix or dappVersion are falsy, or if URL construction fails
    return dappUrlPrefix as string;
  }

  async #asyncSubmitRequest(
    request: KeyringRequest,
  ): Promise<SubmitRequestResponse> {
    this.#state.pendingRequests[request.id] = request;
    await this.#saveState();
    const dappUrl = this.#getCurrentUrl();
    return {
      pending: true,
      redirect: {
        url: dappUrl,
        message: 'Redirecting to Capsule Snap Keyring to sign transaction',
      },
    };
  }

  async #syncSubmitRequest(
    request: KeyringRequest,
  ): Promise<SubmitRequestResponse> {
    const { method, params = [] } = request.request as JsonRpcRequest;
    const signature = await this.#handleSigningRequest(method, params);
    return {
      pending: false,
      result: signature,
    };
  }

  async #handleSigningRequest(method: string, params: Json): Promise<Json> {
    switch (method) {
      case EthMethod.PersonalSign: {
        const [message, from] = params as [string, string];
        return this.#signPersonalMessage(from, message);
      }

      case EthMethod.SignTransaction: {
        const [tx] = params as [any];
        return this.#signTransaction(tx);
      }

      case EthMethod.SignTypedDataV1: {
        const [from, data] = params as [string, Json];
        return this.#signTypedData(from, data, {
          version: SignTypedDataVersion.V1,
        });
      }

      case EthMethod.SignTypedDataV3: {
        const [from, data] = params as [string, Json];
        return this.#signTypedData(from, data, {
          version: SignTypedDataVersion.V3,
        });
      }

      case EthMethod.SignTypedDataV4: {
        const [from, data] = params as [string, Json];
        return this.#signTypedData(from, data, {
          version: SignTypedDataVersion.V4,
        });
      }

      case EthMethod.Sign: {
        const [from, data] = params as [string, string];
        return this.#signMessage(from, data);
      }

      default: {
        throw new Error(`EVM method '${method}' not supported`);
      }
    }
  }

  async #signTransaction(tx: any): Promise<Json> {
    await this.#capsule.init();

    // Patch the transaction to make sure that the `chainId` is a hex string.
    if (!tx.chainId.startsWith('0x')) {
      tx.chainId = `0x${parseInt(tx.chainId, 10).toString(16)}`;
    }
    const common = Common.custom(
      { chainId: tx.chainId },
      {
        hardfork:
          tx.maxPriorityFeePerGas || tx.maxFeePerGas
            ? Hardfork.London
            : Hardfork.Istanbul,
      },
    );
    const factoryTx = TransactionFactory.fromTxData(tx, { common });
    const ethersTx = ethers.Transaction.from(
      `0x${factoryTx.serialize().toString('hex')}`,
    );
    ethersTx.signature = null;

    const ethersSigner = new CapsuleEthersSigner(this.#capsule, null);
    const walletId = await this.#getWalletIdFromAddress(tx.from);
    ethersSigner.setCurrentWalletId(walletId);
    const fullSig = await ethersSigner.signTransaction(ethersTx);

    const signedTx = ethers.Transaction.from(fullSig);
    const signature = signedTx.signature!;
    const signedFactoryTx = TransactionFactory.fromTxData(
      {
        ...tx,
        v: signature.v - 27,
        r: signature.r,
        s: signature.s,
      },
      { common },
    );
    return serializeTransaction(signedFactoryTx.toJSON(), signedFactoryTx.type);
  }

  async #signTypedData(
    from: string,
    data: Json,
    opts: { version: SignTypedDataVersion } = {
      version: SignTypedDataVersion.V1,
    },
  ): Promise<string> {
    await this.#capsule.init();

    const ethersSigner = new CapsuleEthersSigner(this.#capsule, null);
    const walletId = await this.#getWalletIdFromAddress(from);
    ethersSigner.setCurrentWalletId(walletId);
    const typedData = data as unknown as TypedMessage<any>;
    const domain = {
      name: typedData.domain.name ?? null,
      version: opts.version ?? typedData.domain.version ?? null,
      chainId: typedData.domain.chainId ?? null,
      verifyingContract: typedData.domain.verifyingContract ?? null,
      salt: typedData.domain.salt
        ? new Uint8Array(typedData.domain.salt)
        : null,
    };

    return ethersSigner.signTypedData(
      domain,
      typedData.types,
      typedData.message,
    );
  }

  async #signPersonalMessage(from: string, request: string): Promise<string> {
    await this.#capsule.init();

    const messageBuffer = Buffer.from(request.slice(2), 'hex');
    const ethersSigner = new CapsuleEthersSigner(this.#capsule, null);
    const walletId = await this.#getWalletIdFromAddress(from);
    ethersSigner.setCurrentWalletId(walletId);
    const signature = await ethersSigner.signMessage(messageBuffer);

    const recoveredAddress = recoverPersonalSignature({
      data: messageBuffer,
      signature,
    });
    if (recoveredAddress !== from) {
      throw new Error(
        `Signature verification failed for account '${from}' (got '${recoveredAddress}')`,
      );
    }

    return signature;
  }

  async #signMessage(from: string, data: string): Promise<string> {
    await this.#capsule.init();

    const base64Message = Buffer.from(stripHexPrefix(data), 'hex').toString(
      'base64',
    );
    const walletId = await this.#getWalletIdFromAddress(from);

    const res = await this.#capsule.signMessage(walletId, base64Message);
    return (res as SuccessfulSignatureRes).signature;
  }

  async #saveState(): Promise<void> {
    await saveState(this.#state);
  }

  async #emitEvent(
    event: KeyringEvent,
    data: Record<string, Json>,
  ): Promise<void> {
    await emitSnapKeyringEvent(snap, event, data);
  }

  async toggleSyncApprovals(): Promise<void> {
    this.#state.useSyncApprovals = !this.#state.useSyncApprovals;
    await this.#saveState();
  }

  isSynchronousMode(): boolean {
    return this.#state.useSyncApprovals;
  }
}
