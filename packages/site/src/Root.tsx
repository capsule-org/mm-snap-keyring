import type { FunctionComponent, ReactNode } from 'react';
import React from 'react';

import { MetaMaskProvider } from './hooks';

export type RootProps = {
  children: ReactNode;
};

export const Root: FunctionComponent<RootProps> = ({ children }) => {
  return <MetaMaskProvider>{children}</MetaMaskProvider>;
};
