import type { FunctionComponent, ReactNode } from 'react';
import React from 'react';
import { Helmet } from 'react-helmet';
import styled from 'styled-components';

import { Footer, Header, AlertBanner, AlertType } from './components';
import { GlobalStyle } from './config/theme';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  max-width: 100vw;
  padding-top: 25px;
  padding-left: 15%;
  padding-right: 15%;
`;

const SubjectDiv = styled.div`
  font-size: 28px;
  padding-bottom: 18px;
`;

const DescriptionDiv = styled.div`
  font-size: 16px;
  padding-bottom: 14px;
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
      {/* <GlobalStyle /> */}
      <Wrapper>
        <SubjectDiv>Welcome to the Capsule Account Snap!</SubjectDiv>
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
          Capsule wallet, log in with an existing wallet, and in the future even
          set permissions and automations.
        </DescriptionDiv>
        <DescriptionDiv>
          To learn more about Capsule, check out usecapsule.com
        </DescriptionDiv>
        <Header />
        {children}
        <Footer />
      </Wrapper>
    </>
  );
};
