import type { Dispatch, ReactNode, Reducer } from 'react';
import React, { createContext, useEffect, useReducer } from 'react';

import type { Snap } from '../types';
import { hasMetaMask, getSnap } from '../utils';

export type MetamaskState = {
  hasMetaMask: boolean;
  installedSnap?: Snap;
  error?: Error;
  setInstalledCalled?: boolean;
  setMetaMaskDetectedCalled?: boolean;
};

const initialState: MetamaskState = {
  hasMetaMask: false,
};

type MetamaskDispatch = { type: MetamaskActions; payload: any };

export const MetaMaskContext = createContext<
  [MetamaskState, Dispatch<MetamaskDispatch>]
>([
  initialState,
  () => {
    /* no op */
  },
]);

export enum MetamaskActions {
  SetInstalled = 'SetInstalled',
  SetMetaMaskDetected = 'SetMetaMaskDetected',
  SetError = 'SetError',
}

const reducer: Reducer<MetamaskState, MetamaskDispatch> = (state, action) => {
  switch (action.type) {
    case MetamaskActions.SetInstalled:
      return {
        ...state,
        installedSnap: action.payload,
        setInstalledCalled: true,
      };

    case MetamaskActions.SetMetaMaskDetected:
      return {
        ...state,
        hasMetaMask: action.payload,
        setMetaMaskDetectedCalled: true,
      };

    case MetamaskActions.SetError:
      return {
        ...state,
        error: action.payload,
      };

    default:
      return state;
  }
};

/**
 * MetaMask context provider to handle MetaMask and snap status.
 *
 * @param props - React Props.
 * @param props.children - React component to be wrapped by the Provider.
 * @returns JSX.
 */
export const MetaMaskProvider = ({ children }: { children: ReactNode }) => {
  if (typeof window === 'undefined') {
    return <>{children}</>;
  }

  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const detectInstallation = async () => {
      /**
       * Detect if MetaMask is installed.
       */
      async function detectMetaMask(): Promise<boolean> {
        const isMetaMaskDetected = await hasMetaMask();

        dispatch({
          type: MetamaskActions.SetMetaMaskDetected,
          payload: isMetaMaskDetected,
        });
        return isMetaMaskDetected;
      }

      /**
       * Detect if the snap is installed.
       */
      async function detectSnapInstalled() {
        const installedSnap = await getSnap();
        dispatch({
          type: MetamaskActions.SetInstalled,
          payload: installedSnap,
        });
      }

      const mmDetected = await detectMetaMask();

      if (mmDetected) {
        await detectSnapInstalled();
      } else {
        dispatch({
          type: MetamaskActions.SetInstalled,
          payload: undefined,
        });
      }
    };

    detectInstallation().catch(console.error);
  }, [window.ethereum]);

  useEffect(() => {
    let timeoutId: number;

    if (state.error) {
      timeoutId = window.setTimeout(() => {
        dispatch({
          type: MetamaskActions.SetError,
          payload: undefined,
        });
      }, 10000);
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [state.error]);

  return (
    <MetaMaskContext.Provider value={[state, dispatch]}>
      {children}
    </MetaMaskContext.Provider>
  );
};
