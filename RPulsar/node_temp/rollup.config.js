import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/main.js',
  output: {
    file: '../libs/tiptap_dist/tiptap-bundle.js',
    format: 'iife',
    name: 'TiptapBundle',
    sourcemap: false,
    exports: 'named'
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs({
      transformMixedEsModules: true
    })
  ]
};
