const { auth } = require("firebase-admin");
const { initializeApp, applicationDefault } = require("firebase-admin/app");

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  initializeApp({
    credential: applicationDefault(),
  });
} else {
  initializeApp();
}

module.exports = {
  auth,
};
