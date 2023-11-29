import type { SnapConfig } from '@metamask/snaps-cli';
import { merge } from '@metamask/snaps-cli';
import * as webpack from 'webpack';

const config: SnapConfig = {
  bundler: 'webpack',
  input: 'src/index.ts',
  server: { port: 8080 },
  polyfills: true,
  output: {
    minimize: true,
  },
  environment: {
    DAPP_ORIGIN_PRODUCTION: 'https://snap.app.sandbox.usecapsule.com/',
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
          {
            test: /\.(woff(2)?|eot|ttf|otf|svg)$/,
            type: 'asset/resource',
            generator: {
              filename: 'fonts/[name][ext][query]',
            },
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
      plugins: [
        // Add the IgnorePlugin to ignore all CSS files within node_modules
        // @ts-ignore
        new webpack.IgnorePlugin({
          resourceRegExp: /\.css$/,
          contextRegExp: /node_modules/,
        }),
        // Other plugins...
      ],
    }),
};

export default config;
