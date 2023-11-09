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
            <u>Capsule</u> is a signing solution that you can use to create
            secure, embedded <u>MPC wallets</u> with just an email or a social
            login. Capsule-enabled wallets are portable across applications,
            recoverable, and programmable, so you get the best of an embedded
            experience without needing to create different signers or contract
            accounts for every application you use.
          </DescriptionDiv>
          <DescriptionDiv>
            The Capsule Account Snap is an easy way for you to create a new
            Capsule wallet, log in with an existing wallet, and in the future
            even set permissions and automations.
          </DescriptionDiv>
          <DescriptionDiv>
            To learn more about Capsule, check out usecapsule.com
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
