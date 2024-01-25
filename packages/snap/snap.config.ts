import type { SnapConfig } from '@metamask/snaps-cli';
import { merge } from '@metamask/snaps-cli';
import * as path from 'path';
import * as webpack from 'webpack';

const config: SnapConfig = {
  bundler: 'webpack',
  input: 'src/index.ts',
  server: { port: 8081 },
  polyfills: true,
  output: {
    minimize: false,
  },
  sourceMap: false,
  environment: {
    DAPP_ORIGIN_PRODUCTION: 'https://snap.app.usecapsule.com/',
    DAPP_ORIGIN_DEVELOPMENT: 'http://localhost:8000/',
    WASM_HASH_HEX:
      'bba36ed91e17582c23718a9183a557da1112878d4cfbbb3fdf940e65b992eb59',
    WASM_PATH: 'static/js/main-v0_2_0.wasm',
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
              path.resolve(__dirname, './loaders/removeCSSImportLoader.js'),
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
