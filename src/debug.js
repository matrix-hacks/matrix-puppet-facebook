const debug = require('debug');
const appPrefix = 'matrix-puppet';

module.exports = (...filePrefix) => (...rest) => [
  'info', 'error', 'warn'
].reduce((acc, key) => Object.assign({}, acc, {
  [key]: debug([
    appPrefix, 
    ...filePrefix, 
    ...rest,
    'info'
  ].join(':'))
}),{});
