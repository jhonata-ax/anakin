const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { BannerPlugin } = require('webpack');

const isProd = process.env.NODE_ENV === 'production';
const entry = {
  index: './src/widgets/index.tsx',
  'index-sandbox': './src/widgets/index.tsx',
  painter: './src/widgets/painter.tsx',
  painter_sidebar: './src/widgets/painter_sidebar.tsx',
  'painter_sidebar-sandbox': './src/widgets/painter_sidebar.tsx',
  'painter-sandbox': './src/widgets/painter.tsx',
  painter_bottom: './src/widgets/painter_bottom.tsx',
  'painter_bottom-sandbox': './src/widgets/painter_bottom.tsx',
  painter_mini: './src/widgets/painter_mini.tsx',
  'painter_mini-sandbox': './src/widgets/painter_mini.tsx',
};

module.exports = {
  mode: isProd ? 'production' : 'development',
  entry,
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js', publicPath: '' },
  resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js'] },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        loader: 'esbuild-loader',
        options: { loader: 'tsx', target: 'es2020' },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html',
      inject: false,
      templateContent: `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
        const name = new URLSearchParams(window.location.search).get('widgetName');
        if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
          document.body.textContent = 'Widget nao especificado.';
        } else {
          const script = document.createElement('script');
          script.type = 'module';
          script.src = name + '-sandbox.js';
          document.body.appendChild(script);
        }
      </script></body></html>`,
    }),
    new BannerPlugin({
      raw: true,
      banner: (file) => file.chunk.name.includes('-sandbox') ? '' : 'const IMPORT_META=import.meta;',
    }),
    new CopyPlugin({ patterns: [{ from: 'public', to: '.' }, { from: 'README.md', to: '.' }] }),
  ],
  optimization: { minimize: isProd },
  devServer: {
    port: 8080,
    hot: true,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
  },
};
