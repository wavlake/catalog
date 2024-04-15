const crypto = require("crypto");
import axios from "axios";
import OAuth from "oauth";

const ZBD_OAUTH_CLIENT_ID = process.env.ZBD_OAUTH_CLIENT_ID;
const ZBD_OAUTH_CLIENT_SECRET = process.env.ZBD_OAUTH_CLIENT_SECRET;
const ZBD_API_URL = "https://api.zebedee.io/v0/";

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
    ZBD_OAUTH_CLIENT_ID, // CLient ID
    ZBD_OAUTH_CLIENT_SECRET, // Client Secret
    ZBD_API_URL, // ZBD API URL: https://api.zebedee.io/v0/
    authorizeUrl, // Authorization URL: oauth2/authorize/
    tokenPath, // Token Path: oauth2/token
    null
  );
  return oauth2;
};

// Called by the app to get a url it will open in a webview/or browser
export const getZBDRedirectInfo = async (redirectUri: string) => {
  // generate the PKCE key
  const { verifier, challenge } = GeneratePKCE();

  const scope = "user";
  const state = "wavlake-login";
  const suffix = `&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`;

  const oauth2 = createZBDOauth();

  // use NPM module to create the url
  const res = await oauth2.getAuthorizeUrl({
    redirect_uri: redirectUri,
    scope,
  });

  // npm module doesnt support PKCE so append the url with the code_challenge info
  const url = res + suffix;
  return { url, verifier };
};

const getZBDAccessToken = async (payload: Object) => {
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

export const getZBDUserData = async (accessToken: string) => {
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
interface ZBDUserInfo {
  token: string;
  id: string;
  email: string;
  gamerTag: string;
  image: string;
  isVerified: boolean;
  lightningAddress: string;
  publicBio: string;
  publicStaticCharge: string;
  social: any;
}

export const getZBDUserInfo = async (payload: any) => {
  const { code, verifier, redirectUri } = payload;
  try {
    const res = await getZBDAccessToken({
      code,
      client_secret: ZBD_OAUTH_CLIENT_SECRET,
      client_id: ZBD_OAUTH_CLIENT_ID,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const { access_token } = res.data;

    // get user data now we have the access token
    const response = await getZBDUserData(access_token);
    const userData: ZBDUserInfo = response?.data?.data;

    return userData;
  } catch (e) {
    console.error(e);
    return;
  }
};
