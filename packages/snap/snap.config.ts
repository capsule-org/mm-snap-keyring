import type { SnapConfig } from '@metamask/snaps-cli';
import { merge } from '@metamask/snaps-cli';

const config: SnapConfig = {
  bundler: 'webpack',
  input: 'src/index.ts',
  server: { port: 8080 },
  polyfills: true,
  output: {
    minimize: false,
  },
  environment: {
    DAPP_ORIGIN_PRODUCTION: 'https://snap.app.usecapsule.com/',
    DAPP_ORIGIN_DEVELOPMENT: 'http://localhost:8000/',
  },
  stats: {
    builtIns: {
      // The following builtins can be ignored. They are used by some of the
      // dependencies, but are not required by this snap.
      ignore: [
        'events',
        'http',
        'https',
        'zlib',
        'util',
        'url',
        'string_decoder',
        'punycode',
      ],
    },
  },
  experimental: {
    wasm: true,
  },
  customizeWebpackConfig: (webpackConfig) =>
    merge(webpackConfig, {
      module: {
        rules: [
          {
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
          },
          // {
          //   test: /\.(png|jpe?g|gif|svg)$/,
          //   use: [
          //     {
          //       loader: 'file-loader',
          //       options: {
          //         name: '[path][name].[ext]',
          //       },
          //     },
          //   ],
          // },
        ],
      },
    }),
};

export default config;
