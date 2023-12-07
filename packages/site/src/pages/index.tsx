import React from 'react';

import RawIndex from '../components/RawIndex';

// const ClientSideOnlyLazy = React.lazy(
//   async () => import('../components/RawIndex'),
// );
// const WrappedIndex = () => {
//   const isSSR = typeof window === 'undefined';

//   return (
//     <>
//       {!isSSR && (
//         <React.Suspense fallback={<div />}>
//           <ClientSideOnlyLazy />
//         </React.Suspense>
//       )}
//     </>
//   );
// };

export default RawIndex;
