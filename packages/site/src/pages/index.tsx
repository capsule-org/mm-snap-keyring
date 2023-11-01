import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { KeyringSnapRpcClient } from '@metamask/keyring-api';
import type { CoreCapsule } from '@usecapsule/web-sdk';
import Capsule, {
  Environment,
  Button as CapsuleButton,
} from '@usecapsule/web-sdk';
import React, { useContext, useEffect, useState } from 'react';

import { Container } from '../components/styledComponents';
import { defaultSnapOrigin } from '../config';
import { MetaMaskContext, MetamaskActions } from '../hooks';
import type { KeyringState } from '../utils';
import { connectSnap, getSnap, isSynchronousMode } from '../utils';

const snapId = defaultSnapOrigin;

const initialState: {
  pendingRequests: KeyringRequest[];
  accounts: KeyringAccount[];
  useSynchronousApprovals: boolean;
} = {
  pendingRequests: [],
  accounts: [],
  useSynchronousApprovals: true,
};

const Index = () => {
  const [state, dispatch] = useContext(MetaMaskContext);
  const [snapState, setSnapState] = useState<KeyringState>(initialState);

  const client = new KeyringSnapRpcClient(snapId, window.ethereum);

  const capsule = new Capsule(Environment.SANDBOX);

  useEffect(() => {
    /**
     * Return the current state of the snap.
     *
     * @returns The current state of the snap.
     */
    async function getState() {
      if (!state.installedSnap) {
        return;
      }
      const accounts = await client.listAccounts();
      const pendingRequests = await client.listRequests();
      const isSynchronous = await isSynchronousMode();
      setSnapState({
        accounts,
        pendingRequests,
        useSynchronousApprovals: isSynchronous,
      });
    }

    getState().catch((error) => console.error(error));
  }, [state.installedSnap]);

  const syncAccounts = async () => {
    const accounts = await client.listAccounts();
    setSnapState({
      ...snapState,
      accounts,
    });
  };

  const handleConnectClick = async () => {
    try {
      await connectSnap();
      const installedSnap = await getSnap();

      dispatch({
        type: MetamaskActions.SetInstalled,
        payload: installedSnap,
      });
    } catch (error) {
      console.error(error);
      dispatch({ type: MetamaskActions.SetError, payload: error });
    }
  };

  async function createWalletOverride(
    modalCapsule: Capsule | CoreCapsule,
  ): Promise<string> {
    const newAccount = await client.createAccount({
      // @ts-ignore
      userId: modalCapsule.userId,
      email: modalCapsule.getEmail() as string,
      sessionCookie: modalCapsule.retrieveSessionCookie() as string,
    });
    const { recovery, sessionCookie } = newAccount.options;
    delete newAccount.options.recovery;
    modalCapsule.persistSessionCookie(sessionCookie as string);

    const fetchedWallets = await modalCapsule.fetchWallets();
    const walletsMap: Record<string, any> = {};
    fetchedWallets.forEach((wallet) => {
      walletsMap[wallet.id] = {
        id: wallet.id,
        address: wallet.address,
      };
    });
    await modalCapsule.setWallets(walletsMap);

    await syncAccounts();
    return recovery as string;
  }

  async function loginTransitionOverride(
    modalCapsule: Capsule | CoreCapsule,
  ): Promise<void> {
    const allAccounts = snapState.accounts || (await client.listAccounts());
    const currentAccount = allAccounts.find(
      (account) => account.options.email === modalCapsule.getEmail(),
    );

    if (!currentAccount) {
      throw new Error('Account not found');
    }

    await client.updateAccount({
      ...currentAccount,
      options: {
        ...currentAccount.options,
        // @ts-ignore
        userId: modalCapsule.userId,
        email: modalCapsule.getEmail()!,
        sessionCookie: modalCapsule.retrieveSessionCookie()!,
        loginEncryptionKeyPair: JSON.stringify(
          modalCapsule.loginEncryptionKeyPair,
        ),
      },
    });

    const accounts = await client.listAccounts();
    const updatedAccount = accounts.find(
      (account) => account.id === currentAccount.id,
    );
    await modalCapsule.setUserId(updatedAccount!.options.userId as string);
    modalCapsule.persistSessionCookie(
      updatedAccount!.options.sessionCookie as string,
    );

    const fetchedWallets = await modalCapsule.fetchWallets();
    const walletsMap: Record<string, any> = {};
    fetchedWallets.forEach((wallet) => {
      walletsMap[wallet.id] = {
        id: wallet.id,
        address: wallet.address,
      };
    });
    await modalCapsule.setWallets(walletsMap);
  }

  return (
    <Container>
      <CapsuleButton
        appName="Capsule Metamask Snap"
        capsule={capsule}
        createWalletOverride={createWalletOverride}
        loginTransitionOverride={loginTransitionOverride}
      />
    </Container>
  );
};

export default Index;
