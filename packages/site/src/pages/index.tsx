import React from 'react';

const ClientSideOnlyLazy = React.lazy(
  async () => import('../components/RawIndex'),
);
const WrappedIndex = () => {
  const isSSR = typeof window === 'undefined';

  return (
    <>
      {!isSSR && (
        <React.Suspense fallback={<div />}>
          <ClientSideOnlyLazy />
        </React.Suspense>
      )}
    </>
  );
};

export default WrappedIndex;
