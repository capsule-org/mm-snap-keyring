import { Common, Hardfork } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import { stripHexPrefix } from '@ethereumjs/util';
import type { TypedDataV1, TypedMessage } from '@metamask/eth-sig-util';
import {
  SignTypedDataVersion,
  recoverPersonalSignature,
  TypedDataUtils,
  typedSignatureHash,
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
import type { SuccessfulSignatureRes, Environment } from '@usecapsule/web-sdk';
import Capsule, { CapsuleEthersSigner } from '@usecapsule/web-sdk';
import { Buffer } from 'buffer';
import { Signature, ethers } from 'ethers';
import { v4 as uuid } from 'uuid';

import { saveState } from './stateManagement';
import { isEvmChain, serializeTransaction, throwError } from './util';
import wasmArrayBuffer from './wasm/main-v0_3_0.wasm';
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
  userId?: string;
  email: string;
  sessionCookie?: string;
  isExistingUser?: boolean;
  loginEncryptionKeyPair?: any;
};

export class CapsuleKeyring implements Keyring {
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
      process.env.CAPSULE_ENV as Environment,
      process.env.CAPSULE_API_KEY,
      {
        disableWorkers: true,
        useStorageOverrides: true,
        localStorageGetItemOverride,
        localStorageSetItemOverride,
        sessionStorageGetItemOverride,
        sessionStorageSetItemOverride,
        sessionStorageRemoveItemOverride,
        disableWebSockets: true,
      },
    );
  }

  async #getWalletIdFromAddress(address: string): Promise<string> {
    await this.#capsule.init();
    const wallets = this.#capsule.getWallets();
    const currentWallet = Object.values(wallets).find(
      (wallet) => wallet.address === address,
    );
    return currentWallet.id;
  }

  async listAccounts(): Promise<KeyringAccount[]> {
    return Object.values(this.#state.wallets).map((wallet) => wallet.account);
  }

  async getAccount(id: string): Promise<KeyringAccount | undefined> {
    return this.#state.wallets[id]?.account;
  }

  async createAccount(options: CreateAccountOptions): Promise<KeyringAccount> {
    await this.#capsule.init();
    this.#capsule.ctx.wasmOverride = wasmArrayBuffer;

    let wallet: any;
    let recovery: string | null = '';
    let sessionCookie: string;
    if (options.isExistingUser) {
      await this.#capsule.setLoginEncryptionKeyPair(
        JSON.parse(options.loginEncryptionKeyPair as string),
      );
      // second init needed so encryption key pair can be used properly
      await this.#capsule.init();
      delete options.loginEncryptionKeyPair;

      await this.#capsule.setEmail(options.email);
      this.#capsule.persistSessionCookie(options.sessionCookie!);

      await this.#capsule.waitForLoginAndSetup(true);
      // eslint-disable-next-line require-atomic-updates
      sessionCookie = this.#capsule.retrieveSessionCookie()!;
      wallet = Object.values(this.#capsule.getWallets())[0];
      // eslint-disable-next-line require-atomic-updates
      options.userId = this.#capsule.getUserId()!;
    } else {
      await this.#capsule.setUserId(options.userId!);
      await this.#capsule.setEmail(options.email);
      this.#capsule.persistSessionCookie(options.sessionCookie!);
      [wallet, recovery] = await this.#capsule.createWallet();
      delete options.sessionCookie;

      const parsedRecovery = JSON.parse(recovery!);
      const signerBase64 = Buffer.from(
        wallet.signer as string,
        'utf-8',
      ).toString('base64');
      parsedRecovery.backupDecryptionKey += `|${signerBase64}`;
      recovery = JSON.stringify(parsedRecovery);

      sessionCookie = this.#capsule.retrieveSessionCookie() as string;
    }

    const account: KeyringAccount = {
      id: uuid(),
      options,
      address: wallet.address as string,
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
    const accountToReturn = {
      ...account,
      options: {
        ...account.options,
        recovery,
        sessionCookie,
      },
    };
    return accountToReturn;
  }

  async filterAccountChains(_id: string, chains: string[]): Promise<string[]> {
    // The `id` argument is not used because all accounts created by this snap
    // are expected to be compatible with any EVM chain.
    return chains.filter((chain) => isEvmChain(chain));
  }

  async updateAccount(account: KeyringAccount): Promise<void> {
    const { options } = account;
    if (options.sessionCookie) {
      await this.#capsule.setLoginEncryptionKeyPair(
        JSON.parse(options.loginEncryptionKeyPair as string),
      );
      delete options.loginEncryptionKeyPair;
      await this.#capsule.init();

      await this.#capsule.setEmail(options.email as string);
      this.#capsule.persistSessionCookie(options.sessionCookie as string);

      await this.#capsule.waitForLoginAndSetup(true);
      options.sessionCookie = this.#capsule.retrieveSessionCookie() as string;
    }

    const wallet =
      this.#state.wallets[account.id] ??
      throwError(`Account '${account.id}' not found`);

    const newAccount: KeyringAccount = {
      ...wallet.account,
      ...account,
      options: {
        ...wallet.account.options,
        ...options,
      },
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
      return this.#asyncSubmitRequest(request, true);
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

  async rejectRequest(id: string, skipError = false): Promise<void> {
    if (!skipError && this.#state.pendingRequests[id] === undefined) {
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
    skipPendingRequest = false,
  ): Promise<SubmitRequestResponse> {
    if (skipPendingRequest) {
      await this.rejectRequest(request.id, true);
    } else {
      this.#state.pendingRequests[request.id] = request;
      await this.#saveState();
    }

    const dappUrl = this.#getCurrentUrl();
    return {
      pending: true,
      redirect: {
        url: dappUrl,
        message: 'Redirecting to Capsule to sign transaction',
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

  #setRecoveryParam(signature: string): string {
    if (signature.startsWith('0x')) {
      signature = signature.substring(2);
    }
    const recoveryParam = parseInt(signature.slice(-2), 16);
    return `0x${signature.slice(0, -2)}${Signature.getNormalizedV(
      recoveryParam,
    ).toString(16)}`;
  }

  async #signTransaction(tx: any): Promise<Json> {
    await this.#capsule.init();
    this.#capsule.ctx.wasmOverride = wasmArrayBuffer;

    // Patch the transaction to make sure that the `chainId` is a hex string.
    if (!tx.chainId.startsWith('0x')) {
      tx.chainId = `0x${parseInt(tx.chainId, 10).toString(16)}`;
    }
    const isLondonHardFork = tx.maxPriorityFeePerGas || tx.maxFeePerGas;
    const common = Common.custom(
      { chainId: tx.chainId },
      {
        hardfork: isLondonHardFork ? Hardfork.London : Hardfork.Istanbul,
      },
    );
    const factoryTx = TransactionFactory.fromTxData(tx, { common });
    const ethersTx = ethers.Transaction.from(
      `0x${factoryTx.serialize().toString('hex')}`,
    );
    ethersTx.signature = null;

    const walletId = await this.#getWalletIdFromAddress(tx.from);
    const signMessageRes = await this.#capsule.signMessage(
      walletId,
      Buffer.from(stripHexPrefix(ethersTx.unsignedHash), 'hex').toString(
        'base64',
      ),
    );

    const { signature: rawSignature } =
      signMessageRes as SuccessfulSignatureRes;
    ethersTx.signature = `0x${rawSignature}`;
    const { signature } = ethersTx;
    const signedFactoryTx = TransactionFactory.fromTxData(
      {
        ...tx,
        v: isLondonHardFork ? signature!.v - 27 : signature!.v,
        r: signature!.r,
        s: signature!.s,
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
    this.#capsule.ctx.wasmOverride = wasmArrayBuffer;

    const walletId = await this.#getWalletIdFromAddress(from);
    const hashedTypedData =
      opts.version === SignTypedDataVersion.V1
        ? Buffer.from(
            typedSignatureHash(data as TypedDataV1).substring(2),
            'hex',
          )
        : TypedDataUtils.eip712Hash(
            data as unknown as TypedMessage<any>,
            opts.version,
          );

    const signMessageRes = await this.#capsule.signMessage(
      walletId,
      Buffer.from(hashedTypedData).toString('base64'),
    );
    const { signature } = signMessageRes as SuccessfulSignatureRes;
    return this.#setRecoveryParam(signature);
  }

  async #signPersonalMessage(from: string, request: string): Promise<string> {
    await this.#capsule.init();
    this.#capsule.ctx.wasmOverride = wasmArrayBuffer;

    const messageBuffer = Buffer.from(stripHexPrefix(request), 'hex');
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

    return this.#setRecoveryParam(signature);
  }

  async #signMessage(from: string, data: string): Promise<string> {
    await this.#capsule.init();
    this.#capsule.ctx.wasmOverride = wasmArrayBuffer;

    const base64Message = Buffer.from(stripHexPrefix(data), 'hex').toString(
      'base64',
    );
    const walletId = await this.#getWalletIdFromAddress(from);

    const signMessageRes = await this.#capsule.signMessage(
      walletId,
      base64Message,
    );
    const { signature } = signMessageRes as SuccessfulSignatureRes;
    return this.#setRecoveryParam(signature);
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
