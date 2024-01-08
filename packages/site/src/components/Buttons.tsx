import type { ComponentProps } from 'react';
import React from 'react';
import styled from 'styled-components';

import { ReactComponent as MetaMaskFox } from '../assets/metamask_fox.svg';

const Button = styled.button`
  display: flex;
  align-self: flex-start;
  align-items: center;
  justify-content: center;
  margin-top: auto;
`;

const ButtonText = styled.span`
  margin-left: 1rem;
`;

export const ReconnectButton = (props: ComponentProps<typeof Button>) => {
  return (
    <Button {...props}>
      <MetaMaskFox />
      <ButtonText>Reconnect</ButtonText>
    </Button>
  );
};
