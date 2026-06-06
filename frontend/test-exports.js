const tp = require('./node_modules/@rntp/player/lib/commonjs/index.js');
console.log('Keys of tp:', Object.keys(tp));
console.log('tp.default:', !!tp.default);
console.log('tp.setupPlayer:', typeof tp.setupPlayer);
if (tp.default) {
  console.log('tp.default.setupPlayer:', typeof tp.default.setupPlayer);
}
