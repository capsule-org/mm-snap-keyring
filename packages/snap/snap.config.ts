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
    minimize: process.env.NODE_ENV !== 'development',
  },
  environment: {
    DAPP_ORIGIN_PRODUCTION: 'https://snap.app.sandbox.usecapsule.com/',
    DAPP_ORIGIN_DEVELOPMENT: 'http://localhost:8000/',
    WASM_HASH_HEX:
      '9092fb770559a79fb53ad038593609d04bc17205a4429fc6b322f0038c73bb44',
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
