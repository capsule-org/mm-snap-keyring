import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { KeyringSnapRpcClient } from '@metamask/keyring-api';
import type { CoreCapsule } from '@usecapsule/web-sdk';
import type Capsule from '@usecapsule/web-sdk';
import {
  Environment,
  Button as CapsuleButton,
  CapsuleWeb,
} from '@usecapsule/web-sdk';
import type { MouseEventHandler, ReactNode } from 'react';
import React, { useContext, useEffect, useState } from 'react';
import semver from 'semver';
import styled from 'styled-components';

import snapPackageInfo from '../../../snap/package.json';
import { ReconnectButton } from '../components';
import { defaultSnapOrigin } from '../config';
import { MetaMaskContext, MetamaskActions } from '../hooks';
import type { KeyringState } from '../utils';
import {
  connectSnap,
  getSnap,
  isSynchronousMode,
  shouldDisplayReconnectButton,
} from '../utils';

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

const Container = styled.div`
  display: flex;
  flex-direction: row;
`;

const WalletInfoContainer = styled.div`
  padding-right: 60px;
`;

const WalletAddressContainer = styled.div`
  font-size: 24px;
`;

const SessionInfoContainer = styled.div`
  font-size: 16px;
`;

const ReconnectContainer = styled.div`
  padding-bottom: 20px;
`;

const ExtraButtonContainer = styled.div`
  padding-left: 90px;
`;

const Index = () => {
  const [state, dispatch] = useContext(MetaMaskContext);
  const [snapState, setSnapState] = useState<KeyringState>(initialState);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>();
  const [buttonDisplayOverride, setButtonDisplayOverride] =
    useState<ReactNode>();
  const [extraButtonDisplayOverride, setExtraButtonDisplayOverride] =
    useState<ReactNode>();
  const [buttonOnClickOverride, setButtonOnClickOverride] = useState<{
    func: React.MouseEventHandler<HTMLButtonElement> | undefined;
  }>();
  const [preserveButtonOnClick, setPreserveButtonOnClick] = useState(false);
  const [triggerButtonOverrides, setTriggerButtonOverrides] = useState<Date>();
  const client = new KeyringSnapRpcClient(snapId, window.ethereum);

  // TODO: get mm specific api key
  const capsule = new CapsuleWeb(
    Environment.SANDBOX,
    '2f938ac0c48ef356050a79bd66042a23',
  );

  useEffect(() => {
    async function setButtonOverrides() {
      if (!triggerButtonOverrides) {
        return;
      }
      const {
        displayOverride,
        onClickOverride,
        extraDisplayOverride,
        preserveOnClickFunctionality,
      } = await getButtonOverrides();

      if (snapState.accounts.length > 0) {
        if (snapState.accounts[0]!.options.email) {
          await capsule.setEmail(
            snapState.accounts[0]!.options.email as string,
          );
        }
      }

      setPreserveButtonOnClick(Boolean(preserveOnClickFunctionality));
      setButtonOnClickOverride({ func: onClickOverride });
      setExtraButtonDisplayOverride(extraDisplayOverride);
      setButtonDisplayOverride(displayOverride);
    }
    setButtonOverrides().catch((error) => console.error(error));
  }, [isLoggedIn, state, triggerButtonOverrides]);

  useEffect(() => {
    /**
     * Return the current state of the snap.
     *
     * @returns The current state of the snap.
     */
    async function getState() {
      if (!(state.setInstalledCalled && state.setMetaMaskDetectedCalled)) {
        return;
      }
      if (!state.installedSnap) {
        setTriggerButtonOverrides(new Date());
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
      setTriggerButtonOverrides(new Date());
    }

    getState().catch((error) => console.error(error));
  }, [state.setInstalledCalled, state.setMetaMaskDetectedCalled]);

  const syncAccounts = async () => {
    const accounts = await client.listAccounts();
    setSnapState({
      ...snapState,
      accounts,
    });
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
    setIsLoggedIn(true);
    return recovery as string;
  }

  async function loginTransitionOverride(
    modalCapsule: Capsule | CoreCapsule,
  ): Promise<void> {
    const allAccounts = snapState.accounts || (await client.listAccounts());
    let currentAccount = allAccounts.find(
      (account) => account.options.email === modalCapsule.getEmail(),
    );
    if (currentAccount) {
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
    } else {
      for (let i = 0; i < 10; i++) {
        if (capsule.loginEncryptionKeyPair) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      // eslint-disable-next-line require-atomic-updates
      currentAccount = await client.createAccount({
        email: modalCapsule.getEmail() as string,
        sessionCookie: modalCapsule.retrieveSessionCookie() as string,
        isExistingUser: true,
        loginEncryptionKeyPair: JSON.stringify(
          modalCapsule.loginEncryptionKeyPair,
        ),
      });
      await syncAccounts();
    }

    const accounts = await client.listAccounts();
    const updatedAccount = accounts.find(
      (account) => account.id === currentAccount!.id,
    );
    await modalCapsule.setUserId(updatedAccount!.options.userId as string);
    modalCapsule.persistSessionCookie(
      updatedAccount!.options.sessionCookie as string,
    );

    const fetchedWallets = await modalCapsule.fetchWallets();
    const walletsMap: Record<string, any> = {};
    fetchedWallets.forEach((wallet: { id: string; address: string }) => {
      walletsMap[wallet.id] = {
        id: wallet.id,
        address: wallet.address,
      };
    });
    await modalCapsule.setWallets(walletsMap);
    setIsLoggedIn(true);
  }

  const handleConnectClick: unknown = async () => {
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

  const handleLogoutClick: unknown = async () => {
    await capsule.logout();
    setIsLoggedIn(false);
    setTriggerButtonOverrides(new Date());
  };

  async function getButtonOverrides(): Promise<{
    displayOverride: ReactNode;
    extraDisplayOverride?: ReactNode;
    onClickOverride?: React.MouseEventHandler<HTMLButtonElement>;
    preserveOnClickFunctionality?: boolean;
  }> {
    if (!state.hasMetaMask && !state.installedSnap) {
      return {
        displayOverride: 'Download Metamask',
        onClickOverride: () => {
          window.open('https://metamask.io/', '_blank');
        },
      };
    }

    if (!state.installedSnap) {
      return {
        displayOverride: 'Sign in with Metamask',
        onClickOverride:
          handleConnectClick as MouseEventHandler<HTMLButtonElement>,
      };
    }

    const updateAvailable = Boolean(
      state?.installedSnap &&
        semver.gt(snapPackageInfo.version, state.installedSnap?.version),
    );

    if (updateAvailable) {
      return {
        displayOverride: 'Sign in with Metamask',
        onClickOverride:
          handleConnectClick as MouseEventHandler<HTMLButtonElement>,
      };
    }

    if (await capsule.isFullyLoggedIn()) {
      setIsLoggedIn(true);
      return {
        displayOverride: 'Logout',
        onClickOverride:
          handleLogoutClick as MouseEventHandler<HTMLButtonElement>,
        preserveOnClickFunctionality: true,
      };
    }

    setIsLoggedIn(false);
    if (snapState.accounts[0]?.address) {
      return {
        displayOverride: 'Connect',
      };
    }

    return {
      displayOverride: 'Login',
      extraDisplayOverride: 'Create Wallet',
    };
  }

  const address = snapState.accounts[0]?.address;
  const addressDisplay =
    address &&
    `${address.substring(0, 6)}.......${address.substring(
      address.length - 4,
      address.length,
    )}`;
  return buttonDisplayOverride ? (
    <>
      {shouldDisplayReconnectButton(state.installedSnap) ? (
        <ReconnectContainer>
          <ReconnectButton
            onClick={handleConnectClick as MouseEventHandler<HTMLButtonElement>}
          />
        </ReconnectContainer>
      ) : undefined}
      <Container>
        {address ? (
          <WalletInfoContainer>
            <WalletAddressContainer>
              My Wallet: {addressDisplay}
            </WalletAddressContainer>
            <SessionInfoContainer>
              {isLoggedIn ? 'Session: Active' : 'Session: Inactive'}
            </SessionInfoContainer>
          </WalletInfoContainer>
        ) : undefined}
        <CapsuleButton
          appName="Capsule Metamask Snap"
          capsule={capsule}
          createWalletOverride={createWalletOverride}
          loginTransitionOverride={loginTransitionOverride}
          displayOverride={buttonDisplayOverride}
          onClickOverride={buttonOnClickOverride?.func}
          preserveOnClickFunctionality={preserveButtonOnClick}
        />
        {extraButtonDisplayOverride ? (
          <ExtraButtonContainer>
            <CapsuleButton
              appName="Capsule Metamask Snap"
              capsule={capsule}
              createWalletOverride={createWalletOverride}
              loginTransitionOverride={loginTransitionOverride}
              displayOverride={extraButtonDisplayOverride}
              onClickOverride={buttonOnClickOverride?.func}
            />
          </ExtraButtonContainer>
        ) : undefined}
      </Container>
    </>
  ) : undefined;
};

export default Index;
