const path = require('path');

/** The logo every email shows, sent as an inline attachment and referenced as cid:capabble-logo. */
const LOGO_CID = 'capabble-logo';
const LOGO_PATH = path.join(__dirname, 'assets', 'capabble-mark.png');

module.exports = { LOGO_CID, LOGO_PATH };
