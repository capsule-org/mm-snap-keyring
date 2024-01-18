const crypto = require('crypto-browserify');

const webcrypto = {};

module.exports = {
    ...crypto,
    webcrypto: webcrypto,
};
