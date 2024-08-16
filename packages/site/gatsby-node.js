const path = require('path');
const webpack = require('webpack');

module.exports.onCreateWebpackConfig = ({ stage, actions }) => {
  actions.setWebpackConfig({
    plugins: [
      new webpack.NormalModuleReplacementPlugin(/node:/u, (resource) => {
        const mod = resource.request.replace(/^node:/u, '');
        switch (mod) {
          case 'crypto':
            resource.request = 'crypto';
            break;
          default:
            throw new Error(`Not found ${mod}`);
        }
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /\wasm_exec.js$/,
        contextRegExp: /node_modules/,
      }),
      stage === "build-javascript" || stage === "develop" ? new webpack.ProvidePlugin({
        process: 'process/browser',
      }) : undefined,
    ],
    resolve: {
      alias: {
        crypto: require.resolve('./crypto-polyfill'),
        stream: require.resolve('stream-browserify'),
        'object.assign/polyfill': require.resolve(
          '../../node_modules/object.assign/polyfill',
        ),
        vm: false,
      },
      fallback: {
        crypto: require.resolve('./crypto-polyfill'),
        stream: require.resolve('stream-browserify'),
        'object.assign/polyfill': require.resolve(
          '../../node_modules/object.assign/polyfill',
        ),
        vm: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/, // for JavaScript and JSX files
          use: [
            path.resolve(
              __dirname,
              '../site/src/loaders/removeWasmExecImportLoader.js',
            ),
          ],
        },
      ],
    },
  });
};
