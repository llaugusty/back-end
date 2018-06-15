const spawn = require('cross-spawn');
console.log('current dir', __dirname)
const truffleCompile = spawn('../node_modules/.bin/truffle')