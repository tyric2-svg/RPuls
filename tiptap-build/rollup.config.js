import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/tiptap-bundle.js',
  output: {
    file: 'dist/tiptap-bundle.js',
    format: 'iife',
    name: 'TiptapBundle',
    sourcemap: false,
    globals: {}
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs()
  ],
  onwarn: (warning, warn) => {
    // Игнорируем некоторые предупреждения
    if (warning.code === 'CIRCULAR_DEPENDENCY' || warning.code === 'EVAL') return;
    warn(warning);
  }
};
