const BigNumber = require("bignumber.js");
const UNIT_BN = new BigNumber(1e18);

module.exports = {
    encode: function (input) {
        const bn = new BigNumber(input);
        return bn.times(UNIT_BN);
    },
    decode: function (input) {
        const bn = new BigNumber(input);
        return bn.div(UNIT_BN);
    },
};
