const path = require('path');
const webpack = require('webpack');
const Dotenv = require('dotenv-webpack');
const UglifyJS = require('uglifyjs-webpack-plugin');
const CleanWebpack = require('clean-webpack-plugin');

module.exports = {
  entry: ['babel-polyfill', './lib/index.js'],
  target: 'node',
  output: {
    libraryTarget: 'commonjs',
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    loaders: [{
      exclude: [
        /node_modules\/babel-/m,
        /node_modules\/core-js\//m,
        /node_modules\/regenerator-/m,
      ],
      loader: 'babel-loader',
      query: {
        presets: ['es2015', 'es2017', 'stage-2'],
        plugins: ['transform-runtime', 'transform-remove-strict-mode'],
      },
    },
      {
        loader: 'json-loader',
        include: /\.json$/,
      },
      {
        loader: 'octal-number-loader',
        include: /\/node_modules\/node-redshift\/lib\/model\.js/,
      },
    ],
  },
  plugins: (
    process.env.NO_ENV_CHANGE
      ? [new CleanWebpack(['dist'])]
      : [
        new CleanWebpack(['dist']),
        new Dotenv({
          path: '.env',
          safe: false,
        }),
        new UglifyJS(),
        new webpack.EnvironmentPlugin({
          NODE_ENV: 'production',
        }),
      ]),

};
