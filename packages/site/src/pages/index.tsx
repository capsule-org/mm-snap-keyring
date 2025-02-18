import type {
  CurrentWalletIds,
  Environment,
  ModalStep,
  WalletType,
} from '@getpara/react-sdk';
import Para, { openPopup, ParaModal } from '@getpara/react-sdk';
import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { KeyringSnapRpcClient } from '@metamask/keyring-api';
import type { MouseEventHandler, ReactNode } from 'react';
import React, { useContext, useEffect, useState } from 'react';
import semver from 'semver';
import styled from 'styled-components';
import '@getpara/react-sdk/styles.css';

import snapPackageInfo from '../../../snap/package.json';
import { ReactComponent as GreenCheckBox } from '../assets/green_circle_check.svg';
import { ReactComponent as RedX } from '../assets/red_x.svg';
import { ReconnectButton } from '../components';
import { defaultSnapOrigin, paraApiKey, paraEnv } from '../config';
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

const ExpandableButton = ({
  text,
  onClick,
}: {
  text: ReactNode;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) => {
  return (
    <button
      onClick={onClick}
      style={{
        backgroundColor: '#000000',
        color: '#FFFFFF',
        padding: '20px 20px',
        border: 'none',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </button>
  );
};

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
  const [addressDisplay, setAddressDisplay] = useState<string>();
  const [preserveButtonOnClick, setPreserveButtonOnClick] = useState(false);
  const [triggerButtonOverrides, setTriggerButtonOverrides] = useState<Date>();
  const [modalStepOverride, setModalStepOverride] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  const client = new KeyringSnapRpcClient(snapId, window.ethereum);

  const para = new Para(paraEnv as Environment, paraApiKey);

  useEffect(() => {
    // maybe put this in same useEffect as original below?
    async function setButtonOverrides() {
      if (!triggerButtonOverrides) {
        return;
      }
      const snapEmail = snapState.accounts[0]?.options?.email;
      if (snapEmail && snapEmail !== para.getEmail()) {
        await para.setEmail(snapEmail as string);
      }

      const {
        displayOverride,
        onClickOverride,
        extraDisplayOverride,
        preserveOnClickFunctionality,
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
    modalPara: Para,
  ): Promise<{ recoverySecret: string; walletIds: CurrentWalletIds }> {
    const newAccount = await client.createAccount({
      // @ts-ignore
      userId: modalPara.getUserId(),
      email: modalPara.getEmail() as string,
      sessionCookie: modalPara.retrieveSessionCookie() as string,
    });
    const { recovery, sessionCookie, currentWalletIds } = newAccount.options;
    delete newAccount.options.recovery;
    modalPara.persistSessionCookie(sessionCookie as string);
    await modalPara.setCurrentWalletIds(
      currentWalletIds as Partial<Record<WalletType, string[]>>,
    );

    const fetchedWallets = await modalPara.fetchWallets();
    const walletsMap: Record<string, any> = {};
    fetchedWallets.forEach((wallet) => {
      walletsMap[wallet.id] = {
        id: wallet.id,
        address: wallet.address,
        scheme: wallet.scheme,
        type: wallet.type,
      };
    });
    await modalPara.setWallets(walletsMap);

    await syncAccounts();
    setIsLoggedIn(true);
    return {
      recoverySecret: recovery as string,
      walletIds: { EVM: [fetchedWallets[0]!.id] },
    };
  }

  async function loginTransitionOverride(modalPara: Para): Promise<void> {
    const allAccounts = snapState.accounts || (await client.listAccounts());
    let currentAccount = allAccounts.find(
      (account) => account.options.email === modalPara.getEmail(),
    );
    if (currentAccount) {
      await client.updateAccount({
        ...currentAccount,
        options: {
          ...currentAccount.options,
          // @ts-ignore
          userId: modalPara.userId,
          email: modalPara.getEmail()!,
          sessionCookie: modalPara.retrieveSessionCookie()!,
          loginEncryptionKeyPair: JSON.stringify(
            modalPara.loginEncryptionKeyPair,
          ),
        },
      });
    } else {
      for (let i = 0; i < 10; i++) {
        if (para.loginEncryptionKeyPair) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      // eslint-disable-next-line require-atomic-updates
      currentAccount = await client.createAccount({
        email: modalPara.getEmail() as string,
        sessionCookie: modalPara.retrieveSessionCookie() as string,
        isExistingUser: true,
        loginEncryptionKeyPair: JSON.stringify(
          modalPara.loginEncryptionKeyPair,
        ),
      });
      await syncAccounts();
    }

    const accounts = await client.listAccounts();
    const updatedAccount = accounts.find(
      (account) => account.id === currentAccount.id,
    );
    await modalPara.setUserId(updatedAccount!.options.userId as string);
    modalPara.persistSessionCookie(
      updatedAccount!.options.sessionCookie as string,
    );
    await modalPara.setCurrentWalletIds(
      updatedAccount!.options.currentWalletIds as Partial<
        Record<WalletType, string[]>
      >,
    );

    const { isSetup: is2faSetup } = await modalPara.check2FAStatus();
    if (!is2faSetup) {
      setModalStepOverride(MODAL_STEP_2FA);
    }

    const fetchedWallets = await modalPara.fetchWallets();
    const walletsMap: Record<string, any> = {};
    fetchedWallets.forEach(
      (wallet: {
        id: string;
        address: string | null;
        scheme: string;
        type: string;
      }) => {
        walletsMap[wallet.id] = {
          id: wallet.id,
          address: wallet.address,
          scheme: wallet.scheme,
          type: wallet.type,
        };
      },
    );
    await modalPara.setWallets(walletsMap);
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
    await para.logout();

    setIsLoggedIn(false);
    setTriggerButtonOverrides(new Date());
    setModalJustClosed(false);
  };

  const handleConnectClick: unknown = async () => {
    const loginUrl = await para.initiateUserLogin({ email: para.getEmail()! });
    openPopup(loginUrl, 'popup', 'LOGIN_PASSKEY');
    await loginTransitionOverride(para);
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

    if (await para.isFullyLoggedIn()) {
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
        onClickOverride: para.getEmail()
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

  async function onClick(
    event: React.MouseEvent<HTMLButtonElement>,
  ): Promise<void> {
    if (buttonOnClickOverride?.func) {
      buttonOnClickOverride.func(event);
      if (!preserveButtonOnClick) {
        return;
      }
    }

    if (isLoggedIn && addressDisplay) {
      await para.logout();
    } else {
      setIsOpen(true);
    }
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
        <ExpandableButton
          text={buttonDisplayOverride}
          onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
        ></ExpandableButton>

        <ParaModal
          appName="Para Account"
          para={para}
          createWalletOverride={createWalletOverride}
          loginTransitionOverride={loginTransitionOverride}
          onClose={() => {
            setModalJustClosed(true);
            setIsOpen(false);
          }}
          currentStepOverride={modalStepOverride as ModalStep}
          isOpen={isOpen}
        />
        {extraButtonDisplayOverride ? (
          <ExtraButtonContainer>
            <ExpandableButton
              text={extraButtonDisplayOverride}
              onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
            ></ExpandableButton>
          </ExtraButtonContainer>
        ) : undefined}
      </Container>
    </>
  ) : undefined;
};

export default Index;
