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
    DAPP_ORIGIN_PRODUCTION: 'https://snap.app.getpara.com/',
    DAPP_ORIGIN_DEVELOPMENT: 'http://localhost:8000/',
    PARA_ENV: 'PROD',
    PARA_API_KEY: 'f959fcec60c4a3c0b96d8a1b5df169ea',
    DISABLE_WASM_FETCH: 'true',
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
          {
            test: /\.wasm$/,
            use: 'arraybuffer-loader',
          },
        ],
      },
      plugins: [
        // @ts-ignore
        new webpack.IgnorePlugin({
          resourceRegExp: /\.css$/,
          contextRegExp: /node_modules/,
        }),
        new webpack.ProvidePlugin({
          process: 'process/browser',
        }),
      ],
    });
  },
};

export default config;
