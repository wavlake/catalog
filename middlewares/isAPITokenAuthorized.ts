export const isAPITokenAuthorized = (req, res, next) => {
  const sharedSecret = process.env.API_AUTH_CLIENT_KEY;
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header provided" });
  }

  const [bearer, secret] = authHeader.split(" ");

  if (bearer !== "Bearer" || secret !== sharedSecret) {
    return res.status(401).json({ error: "Invalid authorization" });
  }

  next();
};
