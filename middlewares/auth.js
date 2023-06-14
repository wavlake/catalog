const { auth } = require("../library/firebaseService");

const isAuthorized = (req, res, next) => {
  let authToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.split(" ")[0] === "Bearer"
  ) {
    authToken = req.headers.authorization.split(" ")[1];
  } else {
    authToken = null;
  }

  auth()
    .verifyIdToken(authToken)
    .then((user) => {
      req.uid = user.uid;
      next();
    })
    .catch((e) => res.status(401).send("Unauthorized"));
};

module.exports = {
  isAuthorized,
};
