import terser from '@rollup/plugin-terser';

export default [
  // UMD build
  {
    input: 'src/index.js',
    output: {
      file: 'p5.transparency.js',
      format: 'umd',
      name: 'transparency',
      globals: {
        'p5': 'p5'
      }
    },
    external: ['p5']
  },
  // Minified UMD build
  {
    input: 'src/index.js',
    output: {
      file: 'p5.transparency.min.js',
      format: 'umd',
      name: 'transparency',
      globals: {
        'p5': 'p5'
      }
    },
    external: ['p5'],
    plugins: [terser()]
  }
];