// eslint-disable-next-line import/no-unassigned-import
import './utils/overrides';
import type { FunctionComponent, ReactNode } from 'react';
import React from 'react';
import { Helmet } from 'react-helmet';
import styled from 'styled-components';

import { ReactComponent as BalanceSuccess } from './assets/balance_success.svg';
// eslint-disable-next-line import/no-unassigned-import
import './css/site.css';

const Container = styled.div`
  padding-top: 125px;
  display: flex;
  flex-direction: row;
  margin-right: -45px;
`;

const LeftColumnContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 54%;
  padding-left: 12%;
  padding-right: 2%;
  font-family: 'Hanken Grotesk', sans-serif;
`;

const RighColumnContainer = styled.div`
  padding-left: 2%;
`;

const SubjectDiv = styled.div`
  font-size: 30px;
  padding-bottom: 22px;
  line-height: 30px;
`;

const DescriptionDiv = styled.div`
  font-size: 16px;
  padding-bottom: 14px;
`;

const DescriptionListDiv = styled.div`
  margin-left: 16px;
`;

const ChildrenDiv = styled.div`
  padding-top: 50px;
`;

export type AppProps = {
  children: ReactNode;
};

export const App: FunctionComponent<AppProps> = ({ children }) => {
  // Make sure we are on a browser, otherwise we can't use window.ethereum.
  if (typeof window === 'undefined') {
    return null;
  }

  return (
    <>
      <Helmet>
        <meta charSet="utf-8" />
        <title>SSK - Capsule Snap Keyring</title>
      </Helmet>
      <Container>
        <LeftColumnContainer>
          <SubjectDiv>
            Welcome to the <br />
            Capsule Account Snap!
          </SubjectDiv>
          <DescriptionDiv>
            <br />
            <a target="_blank" href="https://usecapsule.com">
              <u>Capsule</u>
            </a>{' '}
            is a signing solution that you can use to create secure, embedded{' '}
            <a target="_blank" href="https://blog.usecapsule.com/what-is-mpc">
              <u>MPC wallets</u>
            </a>{' '}
            with just an email or a social login.
          </DescriptionDiv>
          <DescriptionDiv>
            It's easy to use your Capsule wallet to sign anywhere you can use
            MetaMask! Getting started is easy:
          </DescriptionDiv>
          <DescriptionDiv>
            <DescriptionListDiv>
              <ol>
                <li>Log in with your Capsule Wallet below.</li>
                <li>
                  Connect to MetaMask and accept permissions to add the{' '}
                  <strong>Capsule</strong> Snap Account.
                </li>
                <li>
                  Sign transactions easily! Come back to this page to manage
                  your session or check your address.
                </li>
              </ol>
            </DescriptionListDiv>
          </DescriptionDiv>
          <DescriptionDiv>
            To learn more, check out the{' '}
            <a target="_blank" href="https://docs.usecapsule.com/metamask">
              <u>Capsule Snap FAQ</u>
            </a>
          </DescriptionDiv>
          <ChildrenDiv>{children}</ChildrenDiv>
        </LeftColumnContainer>
        <RighColumnContainer>
          <BalanceSuccess />
        </RighColumnContainer>
      </Container>
    </>
  );
};
