const log = require("loglevel");
const Sentry = require("@sentry/node");

const wavlakeErrorHandler = (err) => {
  log.debug(err);
  Sentry.captureException(err);
};

module.exports = {
  wavlakeErrorHandler,
};
