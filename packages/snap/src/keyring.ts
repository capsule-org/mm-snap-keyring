import { Common, Hardfork } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import {
  Address,
  ecsign,
  stripHexPrefix,
  toBuffer,
  toChecksumAddress,
  isValidPrivate,
  addHexPrefix,
} from '@ethereumjs/util';
import type { TypedDataV1, TypedMessage } from '@metamask/eth-sig-util';
import {
  SignTypedDataVersion,
  concatSig,
  personalSign,
  recoverPersonalSignature,
  signTypedData,
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
import Capsule, { Environment, CapsuleEthersSigner } from '@usecapsule/web-sdk';
import { Buffer } from 'buffer';
import { v4 as uuid } from 'uuid';
import { ethers } from 'ethers';

import { saveState } from './stateManagement';
import {
  isEvmChain,
  serializeTransaction,
  isUniqueAddress,
  throwError,
  runSensitive,
} from './util';
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
  privateKey: string;
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

    const localStorageGetItemOverride = (key: string): Promise<string | null> => {
      return this.#state.capsuleLocalStorage[key] ?? null;
    };
    const localStorageSetItemOverride = (key: string, value: string): Promise<void> => {
      this.#state.capsuleLocalStorage[key] = value;
    };
    const sessionStorageGetItemOverride = (key: string): Promise<string | null> => {
      return this.#state.capsuleSessionStorage[key] ?? null;
    };
    const sessionStorageSetItemOverride = (key: string, value: string): Promise<void> => {
      this.#state.capsuleSessionStorage[key] = value;
    };
    const sessionStorageRemoveItemOverride = (key: string): Promise<void> => {
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
    console.log(this.#capsule);
  }

  // window.addEventListener = function () {}
  // window.removeEventListener = function () {}

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

  async createAccount(
    options: Record<string, Json> = {},
  ): Promise<KeyringAccount> {
    this.#state.wallets = {};
    this.#state.capsuleLocalStorage = {};
    this.#state.capsuleSessionStorage = {};
    const localStorageGetItemOverride = (key: string): Promise<string | null> => {
      return this.#state.capsuleLocalStorage[key] ?? null;
    };
    const localStorageSetItemOverride = (key: string, value: string): Promise<void> => {
      this.#state.capsuleLocalStorage[key] = value;
    };
    const sessionStorageGetItemOverride = (key: string): Promise<string | null> => {
      return this.#state.capsuleSessionStorage[key] ?? null;
    };
    const sessionStorageSetItemOverride = (key: string, value: string): Promise<void> => {
      this.#state.capsuleSessionStorage[key] = value;
    };
    const sessionStorageRemoveItemOverride = (key: string): Promise<void> => {
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
    await this.#capsule.init();
    // const { privateKey, address } = this.#getKeyPair(
    //   options?.privateKey as string | undefined,
    // );

    // if (!isUniqueAddress(address, Object.values(this.#state.wallets))) {
    //   throw new Error(`Account address already in use: ${address}`);
    // }
    // The private key should not be stored in the account options since the
    // account object is exposed to external components, such as MetaMask and
    // the snap UI.
    if (options?.privateKey) {
      delete options.privateKey;
    }

    try {
      // console.log('create acccount try again');
      // console.log(this.#capsule);
      // await this.#capsule.createUser('mmsnap3@test.usecapsule.com');
      // console.log(await this.#capsule.verifyEmail('123456'));
      // console.log(this.#storage);
      console.log('before actual create wallet');
      await this.#capsule.setUserId(options.userId as string);
      await this.#capsule.setEmail(options.email as string);
      try {
        console.log(await this.#capsule.createWallet(true, () => {}));
      } catch (error) {
        console.log(error);
      }
      console.log('have done them all');
      const account: KeyringAccount = {
        id: uuid(),
        options,
        address: Object.values(this.#capsule.getWallets())[0].address as string,
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

      this.#state.wallets[account.id] = { account, privateKey: '' };
      await this.#saveState();
      return account;
    } catch (error) {
      throw new Error((error as Error).message);
    }
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
        message: 'Redirecting to Snap Simple Keyring to sign transaction',
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

  #getWalletByAddress(address: string): Wallet {
    const match = Object.values(this.#state.wallets).find(
      (wallet) =>
        wallet.account.address.toLowerCase() === address.toLowerCase(),
    );

    return match ?? throwError(`Account '${address}' not found`);
  }

  #getKeyPair(privateKey?: string): {
    privateKey: string;
    address: string;
  } {
    const privateKeyBuffer: Buffer = runSensitive(
      () =>
        privateKey
          ? toBuffer(addHexPrefix(privateKey))
          : Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
      'Invalid private key',
    );

    if (!isValidPrivate(privateKeyBuffer)) {
      throw new Error('Invalid private key');
    }

    const address = toChecksumAddress(
      Address.fromPrivateKey(privateKeyBuffer).toString(),
    );
    return { privateKey: privateKeyBuffer.toString('hex'), address };
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
    console.log('sign transaction');
    console.log(tx);
    // Patch the transaction to make sure that the `chainId` is a hex string.
    if (!tx.chainId.startsWith('0x')) {
      tx.chainId = `0x${parseInt(tx.chainId, 10).toString(16)}`;
    }

    // const wallet = this.#getWalletByAddress(tx.from);
    // const privateKey = Buffer.from(wallet.privateKey, 'hex');
    const common = Common.custom(
      { chainId: tx.chainId },
      {
        hardfork:
          tx.maxPriorityFeePerGas || tx.maxFeePerGas
            ? Hardfork.London
            : Hardfork.Istanbul,
      },
    );

    // const signedTx = TransactionFactory.fromTxData(tx, {
    //   common,
    // }).sign(privateKey);
    console.log('before factory tx');
    const factoryTx = TransactionFactory.fromTxData(tx, { common });
    console.log('before built tx');
    let builtTx: ethers.Transaction;
    try {
      builtTx = ethers.Transaction.from(
        `0x${factoryTx.serialize().toString('hex')}`,
      );
    } catch (error) {
      console.log('error from builtTx');
      console.log(error);
      throw error;
    }

    console.log('built tx');
    console.log(builtTx);
    console.log(JSON.stringify(builtTx));
    const ALCHEMY_SEPOLIA_PROVIDER =
      'https://eth-sepolia.g.alchemy.com/v2/KfxK8ZFXw9mTUuJ7jt751xGJCa3r8noZ';
    const provider = new ethers.JsonRpcProvider(
      ALCHEMY_SEPOLIA_PROVIDER,
      'sepolia',
    );
    console.log('after provider new');
    builtTx.signature = null;
    const ethersSigner = new CapsuleEthersSigner(this.#capsule, provider);
    console.log('about to sign transaction new');
    let fullSig: string;
    try {
      console.log('wallets here');
      console.log(this.#capsule.getWallets());
      const hardcodedTx = {
        from: Object.values(this.#capsule.getWallets())[0]?.address as string,
        to: builtTx.to, // '0x42c9a72c9dfcc92cae0de9510160cea2da27af91',
        value: builtTx.value, // 404000000,
        gasLimit: builtTx.gasLimit, // 21000,
        maxPriorityFeePerGas: builtTx.maxPriorityFeePerGas, // 1000000000,
        maxFeePerGas: builtTx.maxFeePerGas, // 3000000000,
        nonce: builtTx.nonce, // 0,
        chainId: builtTx.chainId, // '11155111',
        type: 2,
      };
      console.log('hardcoded');
      console.log(hardcodedTx);
      fullSig = await ethersSigner.signTransaction(hardcodedTx);
    } catch (error) {
      console.log('error from fullSig');
      console.log(error);
      throw error;
    }
    return fullSig;
  }

  #signTypedData(
    from: string,
    data: Json,
    opts: { version: SignTypedDataVersion } = {
      version: SignTypedDataVersion.V1,
    },
  ): string {
    const { privateKey } = this.#getWalletByAddress(from);
    const privateKeyBuffer = Buffer.from(privateKey, 'hex');

    return signTypedData({
      privateKey: privateKeyBuffer,
      data: data as unknown as TypedDataV1 | TypedMessage<any>,
      version: opts.version,
    });
  }

  async #signPersonalMessage(from: string, request: string): Promise<string> {
    await this.#capsule.init();
    // const { privateKey } = this.#getWalletByAddress(from);
    // const privateKeyBuffer = Buffer.from(privateKey, 'hex');
    const messageBuffer = Buffer.from(request.slice(2), 'hex');

    // const signature = personalSign({
    //   privateKey: privateKeyBuffer,
    //   data: messageBuffer,
    // });
    const ALCHEMY_SEPOLIA_PROVIDER =
      'https://eth-sepolia.g.alchemy.com/v2/KfxK8ZFXw9mTUuJ7jt751xGJCa3r8noZ';
    const provider = new ethers.JsonRpcProvider(
      ALCHEMY_SEPOLIA_PROVIDER,
      'sepolia',
    );
    const ethersSigner = new CapsuleEthersSigner(this.#capsule, provider);
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

  #signMessage(from: string, data: string): string {
    const { privateKey } = this.#getWalletByAddress(from);
    const privateKeyBuffer = Buffer.from(privateKey, 'hex');
    const message = stripHexPrefix(data);
    const signature = ecsign(Buffer.from(message, 'hex'), privateKeyBuffer);
    return concatSig(toBuffer(signature.v), signature.r, signature.s);
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
