const crypto = require("crypto");
import axios from "axios";
import OAuth from "oauth";

const ZBD_CLIENT_ID = process.env.ZBD_CLIENT_ID;
const ZBD_CLIENT_SECRET = process.env.ZBD_CLIENT_SECRET;
const ZBD_API_URL = process.env.ZBD_API_URL;
const ZBD_REDIRECT_URL = process.env.ZBD_REDIRECT_URL;

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest();
}

function base64URLEncode(str) {
  return str
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function GeneratePKCE() {
  const verifier = base64URLEncode(crypto.randomBytes(32));

  if (verifier) {
    const challenge = base64URLEncode(sha256(verifier));
    return { challenge, verifier };
  }
}

const createZBDOauth = () => {
  const { OAuth2 } = OAuth;
  const authorizeUrl = "oauth2/authorize";
  const tokenPath = "oauth2/token";
  const oauth2 = new OAuth2(
    ZBD_CLIENT_ID, // CLient ID
    ZBD_CLIENT_SECRET, // Client Secret
    ZBD_API_URL, // ZBD API URL: https://api.zebedee.io/v0/
    authorizeUrl, // Authorization URL: oauth2/authorize/
    tokenPath, // Token Path: oauth2/token
    null
  );
  return oauth2;
};

const { verifier, challenge } = GeneratePKCE();
// this is needed to store the verifier for the user so we can validate it in the callback
// but we dont have a user object yet
const userId = "some-unique-id";

// Called by the app to get a url it will open in a webview/or browser
export const getZBDLoginUrl = async () => {
  // generate the PKCE key

  // save the verifier/key to the user object so we can access it when validating in the callback
  // await User.findOneAndUpdate({ userId }, { oauthVerifier: verifier });

  const scope = "user";
  const state = userId;
  const suffix = `&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

  const oauth2 = createZBDOauth();

  // use NPM module to create the url
  const res = await oauth2.getAuthorizeUrl({
    redirect_uri: ZBD_REDIRECT_URL,
    scope,
  });

  // npm module doesnt support PKCE so append the url with the code_challenge info
  const url = res + suffix;
  return url;
};

const getAccessToken = async (payload: Object) => {
  const response = await axios({
    method: "POST",
    data: payload,
    url: `https://api.zebedee.io/v0/oauth2/token`,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
    },
  }).catch((e) => {
    console.error("res", e.response.data);
    return { data: "error" };
  });
  return response;
};

export const getUserData = async (accessToken: string) => {
  const response = await axios({
    method: "GET",
    url: `https://api.zebedee.io/v0/oauth2/user`,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch((e) => {
    return { data: "error" };
  });
  return response;
};

// called by ZBD oauth on login
export const zbdLoginCallback = async (payload: any) => {
  const { code, state } = payload;
  try {
    const res = await getAccessToken({
      code,
      client_secret: ZBD_CLIENT_SECRET,
      client_id: ZBD_CLIENT_ID,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: ZBD_REDIRECT_URL,
    });
    const { access_token } = res.data;

    // get user data now we have the access token
    const response = await getUserData(access_token);
    const userData = response?.data?.data;

    return {
      success: true,
      data: userData,
    };
  } catch (e) {
    console.error(e);
    return { success: false, data: e.message };
  }
};
