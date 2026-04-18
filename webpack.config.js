const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env = {}, argv) => {
  const isWeb = env.web === true;

  return {
    entry: './src/main.jsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bundle.[contenthash].js',
      publicPath: './',  // Required for file:// protocol in Electron packaged app
      clean: true,
    },
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      alias: {
        '@engine': path.resolve(__dirname, 'src/engine'),
        '@renderer': path.resolve(__dirname, 'src/renderer'),
        '@ui': path.resolve(__dirname, 'src/ui'),
        '@ai': path.resolve(__dirname, 'src/ai'),
        '@data': path.resolve(__dirname, 'src/data'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@services': path.resolve(__dirname, 'src/services'),
        '@assets': path.resolve(__dirname, 'assets'),
        '@art': path.resolve(__dirname, 'src/art'),
      },
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react'],
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|hdr|ico)$/i,
          type: 'asset/resource',
        },
        {
          test: /\.(glsl|vert|frag)$/,
          type: 'asset/source',
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
        title: 'StarSim - Cosmic Simulator',
        favicon: './assets/icon.png',
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'assets', to: 'assets', noErrorOnMissing: true },
        ],
      }),
    ],
    devServer: {
      port: 9000,
      hot: true,
      open: true,
      host: '0.0.0.0',           // Allow LAN access
      allowedHosts: 'all',
      static: {
        directory: path.join(__dirname, 'dist'),
      },
    },
  };
};
