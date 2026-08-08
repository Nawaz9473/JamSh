import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: /^lucide-react-native$/, replacement: 'lucide-react' },
      { find: /^react-native-svg$/, replacement: 'react-native-web' },
      { find: /^react-native\/Libraries\/Utilities\/codegenNativeComponent$/, replacement: path.resolve(__dirname, './src/mocks/codegenNativeComponent.js') },
    ],
  },
});
