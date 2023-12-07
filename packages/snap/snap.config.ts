import type { SnapConfig } from '@metamask/snaps-cli';
import { merge } from '@metamask/snaps-cli';
import * as path from 'path';
import * as webpack from 'webpack';

const config: SnapConfig = {
  bundler: 'webpack',
  input: 'src/index.ts',
  server: { port: 8080 },
  polyfills: true,
  output: {
    minimize: false,
  },
  environment: {
    DAPP_ORIGIN_PRODUCTION: 'https://snap.app.sandbox.usecapsule.com/',
    DAPP_ORIGIN_DEVELOPMENT: 'http://localhost:8000/',
    WASM_HASH_HEX:
      'a0a7622e5d4433257f42ed1202318af84ab8fe3b6ecbe3e30b0127bd91971133',
    WASM_PATH: 'static/js/main.wasm',
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
  customizeWebpackConfig: (webpackConfig) => {
    return merge(webpackConfig, {
      module: {
        rules: [
          {
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
          },
          {
            test: /\.(woff(2)?|eot|ttf|otf|svg)$/,
            type: 'asset/resource',
            generator: {
              filename: 'fonts/[name][ext][query]',
            },
          },
          {
            test: /\.jsx?$/, // for JavaScript and JSX files
            use: [
              path.resolve(
                __dirname,
                '../snap/loaders/removeCSSImportLoader.js',
              ),
            ],
          },
        ],
      },
      plugins: [
        // @ts-ignore
        new webpack.IgnorePlugin({
          resourceRegExp: /\.css$/,
          contextRegExp: /node_modules/,
        }),
      ],
    });
  },
};

export default config;
