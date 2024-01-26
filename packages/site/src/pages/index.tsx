import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { KeyringSnapRpcClient } from '@metamask/keyring-api';
import type { CapsuleDeprecated, CoreCapsule } from '@usecapsule/web-sdk';
import Capsule, {
  Environment,
  Button as CapsuleButton,
} from '@usecapsule/web-sdk';
import type { MouseEventHandler, ReactNode } from 'react';
import React, { useContext, useEffect, useState } from 'react';
import semver from 'semver';
import styled from 'styled-components';

import snapPackageInfo from '../../../snap/package.json';
import { ReactComponent as GreenCheckBox } from '../assets/green_circle_check.svg';
import { ReactComponent as RedX } from '../assets/red_x.svg';
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

const SessionStatusContainer = styled.div`
  margin-left: -10px;
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

const MODAL_STEP_2FA = 'SETUP_2FA';

const Index = () => {
  const [state, dispatch] = useContext(MetaMaskContext);
  const [snapState, setSnapState] = useState<KeyringState>(initialState);
  const [shouldPreserveOnClick, setShouldPreserveOnClick] =
    useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>();
  const [modalJustClosed, setModalJustClosed] = useState<boolean>();
  const [buttonDisplayOverride, setButtonDisplayOverride] =
    useState<ReactNode>();
  const [extraButtonDisplayOverride, setExtraButtonDisplayOverride] =
    useState<ReactNode>();
  const [buttonOnClickOverride, setButtonOnClickOverride] = useState<{
    func: React.MouseEventHandler<HTMLButtonElement> | undefined;
  }>();
  const [buttonPropsState, setButtonPropsState] =
    useState<Record<string, any>>();
  const [addressDisplay, setAddressDisplay] = useState<string>();
  const [preserveButtonOnClick, setPreserveButtonOnClick] = useState(false);
  const [triggerButtonOverrides, setTriggerButtonOverrides] = useState<Date>();
  const [modalIsOpenOverride, setModalIsOpenOverride] = useState<boolean>();
  const [modalStepOverride, setModalStepOverride] = useState<string>();
  const client = new KeyringSnapRpcClient(snapId, window.ethereum);

  const capsule = new Capsule(
    Environment.SANDBOX,
    '2f938ac0c48ef356050a79bd66042a23',
  );

  useEffect(() => {
    // maybe put this in same useEffect as original below?
    async function setButtonOverrides() {
      if (!triggerButtonOverrides) {
        return;
      }
      const snapEmail = snapState.accounts[0]?.options?.email;
      if (snapEmail && snapEmail !== capsule.getEmail()) {
        await capsule.setEmail(snapEmail as string);
      }

      const {
        displayOverride,
        onClickOverride,
        extraDisplayOverride,
        preserveOnClickFunctionality,
        buttonProps,
      } = await getButtonOverrides();

      const address = snapState.accounts[0]?.address;
      setAddressDisplay(
        address &&
          `${address.substring(0, 6)}.......${address.substring(
            address.length - 4,
            address.length,
          )}`,
      );

      setPreserveButtonOnClick(Boolean(preserveOnClickFunctionality));
      setButtonOnClickOverride({ func: onClickOverride });
      setExtraButtonDisplayOverride(extraDisplayOverride);
      setButtonDisplayOverride(displayOverride);
      setButtonPropsState(buttonProps);
    }
    setButtonOverrides().catch((error) => console.error(error));
  }, [modalJustClosed, state, triggerButtonOverrides]);

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
    modalCapsule: CoreCapsule | CapsuleDeprecated,
  ): Promise<string> {
    const newAccount = await client.createAccount({
      // @ts-ignore
      userId: modalCapsule.getUserId(),
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
    modalCapsule: CoreCapsule | CapsuleDeprecated,
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
      (account) => account.id === currentAccount.id,
    );
    await modalCapsule.setUserId(updatedAccount!.options.userId as string);
    modalCapsule.persistSessionCookie(
      updatedAccount!.options.sessionCookie as string,
    );

    const { isSetup: is2faSetup } = await modalCapsule.check2FAStatus();
    if (!is2faSetup) {
      setModalStepOverride(MODAL_STEP_2FA);
      setModalIsOpenOverride(true);
    }

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

  const handleInstallSnapClick: unknown = async () => {
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

  const handleLogoutClick = async () => {
    await capsule.logout();

    setIsLoggedIn(false);
    setTriggerButtonOverrides(new Date());
    setModalJustClosed(false);
  };

  const handleConnectClick: unknown = async () => {
    const loginUrl = await capsule.initiateUserLogin(capsule.getEmail()!);
    window.open(loginUrl, 'popup', 'popup=true,width=400,height=500');
    await loginTransitionOverride(capsule);
    setShouldPreserveOnClick(true);
    setTriggerButtonOverrides(new Date());
    setModalJustClosed(false);
    setModalStepOverride(undefined);
  };

  async function getButtonOverrides(): Promise<{
    displayOverride: ReactNode;
    extraDisplayOverride?: ReactNode;
    onClickOverride?: React.MouseEventHandler<HTMLButtonElement> | undefined;
    preserveOnClickFunctionality?: boolean;
    buttonProps?: Record<string, any>;
  }> {
    if (!state.hasMetaMask && !state.installedSnap) {
      return {
        displayOverride: 'Download MetaMask',
        onClickOverride: () => {
          window.open('https://metamask.io/', '_blank');
        },
      };
    }

    if (!state.installedSnap) {
      return {
        displayOverride: 'Sign in with MetaMask',
        onClickOverride:
          handleInstallSnapClick as MouseEventHandler<HTMLButtonElement>,
        buttonProps: {
          width: '200px',
        },
      };
    }

    const updateAvailable = Boolean(
      state?.installedSnap &&
        semver.gt(snapPackageInfo.version, state.installedSnap?.version),
    );

    if (updateAvailable) {
      return {
        displayOverride: 'Sign in with MetaMask',
        onClickOverride:
          handleInstallSnapClick as MouseEventHandler<HTMLButtonElement>,
        buttonProps: {
          width: '200px',
        },
      };
    }

    if (await capsule.isFullyLoggedIn()) {
      setIsLoggedIn(true);
      return {
        displayOverride: 'Logout',
        onClickOverride:
          handleLogoutClick as MouseEventHandler<HTMLButtonElement>,
        preserveOnClickFunctionality: !shouldPreserveOnClick,
      };
    }

    setIsLoggedIn(false);
    if (snapState.accounts[0]?.address) {
      return {
        displayOverride: 'Connect',
        onClickOverride: capsule.getEmail()
          ? (handleConnectClick as MouseEventHandler<HTMLButtonElement>)
          : undefined,
      };
    }

    return {
      displayOverride: 'Login',
      extraDisplayOverride: 'Create Wallet',
      buttonProps: {
        width: '120px',
      },
      onClickOverride: () => {
        setShouldPreserveOnClick(true);
      },
      preserveOnClickFunctionality: true,
    };
  }

  return buttonDisplayOverride ? (
    <>
      {shouldDisplayReconnectButton(state.installedSnap) ? (
        <ReconnectContainer>
          <ReconnectButton
            onClick={
              handleInstallSnapClick as MouseEventHandler<HTMLButtonElement>
            }
          />
        </ReconnectContainer>
      ) : undefined}
      <Container>
        {addressDisplay ? (
          <WalletInfoContainer>
            <WalletAddressContainer>
              My Wallet: {addressDisplay}
            </WalletAddressContainer>
            <SessionStatusContainer>
              {isLoggedIn ? (
                <GreenCheckBox viewBox="-10 0 45 45" />
              ) : (
                <RedX viewBox="-10 0 45 45" />
              )}
              <SessionInfoContainer>
                {isLoggedIn ? 'Session: Active' : 'Session: Inactive'}
              </SessionInfoContainer>
            </SessionStatusContainer>
          </WalletInfoContainer>
        ) : undefined}
        <CapsuleButton
          appName="Capsule Account"
          capsule={capsule}
          overrides={{
            createWalletOverride,
            loginTransitionOverride,
            displayOverride: buttonDisplayOverride,
            onClickOverride: buttonOnClickOverride?.func,
            preserveOnClickFunctionality: preserveButtonOnClick,
            onCloseOverride: () => {
              setModalJustClosed(true);
            },
            buttonProps: buttonPropsState,
            modalIsOpenOverride,
            setModalIsOpenOverride: modalIsOpenOverride
              ? setModalIsOpenOverride
              : undefined,
            currentStepOverride: modalStepOverride,
          }}
        />
        {extraButtonDisplayOverride ? (
          <ExtraButtonContainer>
            <CapsuleButton
              appName="Capsule Account"
              capsule={capsule}
              overrides={{
                createWalletOverride,
                loginTransitionOverride,
                displayOverride: extraButtonDisplayOverride,
                onCloseOverride: () => {
                  setModalJustClosed(true);
                },
                onClickOverride: buttonOnClickOverride?.func,
                preserveOnClickFunctionality: preserveButtonOnClick,
              }}
            />
          </ExtraButtonContainer>
        ) : undefined}
      </Container>
    </>
  ) : undefined;
};

export default Index;
