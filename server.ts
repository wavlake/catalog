import app from ".";
import log from "loglevel";

const port = process.env.EXPRESS_PORT;

export const server = app.listen(port, () => {
  log.debug(`Wavlake catalog is listening on port ${port}`);
});
