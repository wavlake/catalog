import { useEffect, useState } from "react";
import { auth } from "../utils/firebase";
import {
  applyActionCode,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateCurrentUser,
  GoogleAuthProvider,
  TwitterAuthProvider,
  UserCredential,
  User,
} from "firebase/auth";
import { useRouter } from "next/router";
import apiClient from "../utils/apiClient";
import { useQueryClient } from "react-query";
import { AuthContext } from "./authContext";

const twitterProvider = new TwitterAuthProvider();
const googleProvider = new GoogleAuthProvider();

export default function useAuth(): AuthContext {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  async function createEmailUser(email: string, password: string) {
    return createUserWithEmailAndPassword(auth, email, password)
      .then((result) => {
        // Signed in
        handleNewUser({ result: result, provider: "email" });
        handleSendEmailVerification();
        router.push("/");
        return { error: false };
      })
      .catch((error) => {
        // console.log(error);
        return { error: error.code };
      });
  }

  async function handleSendEmailVerification() {
    if (auth.currentUser) {
      return sendEmailVerification(auth.currentUser)
        .then(() => {
          return { success: true };
        })
        .catch((error) => {
          // console.log(error);
          return { error: error.code };
        });
    }
  }

  async function handleVerifyEmail(window: Window, continueUrl = "/dashboard") {
    // Localize the UI to the selected language as determined by the lang
    // parameter.
    // Try to apply the email verification code.
    const queryParams = window.location.search;
    const urlParams = new URLSearchParams(queryParams);
    const actionCode = urlParams.get("oobCode") || "";
    return applyActionCode(auth, actionCode)
      .then(() => {
        // Email address has been verified.
        signOut(auth);
        return { success: true, continueUrl: continueUrl };
        // TODO: Display a confirmation message to the user.
        // You could also provide the user with a link back to the app.

        // TODO: If a continue URL is available, display a button which on
        // click redirects the user back to the app via continueUrl with
        // additional state determined from that URL's parameters.
      })
      .catch((error) => {
        // Code is invalid or expired. Ask the user to verify their email address
        // again.
        return { error: error.code };
      });
  }

  async function logInEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    return signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        // Signed in
        router.push("/");
        return { success: true };
      })
      .catch((error) => {
        // console.log(error.message);
        return { success: false, error: error.code };
      });
  }

  async function logInGoogle() {
    return signInWithPopup(auth, googleProvider)
      .then((result) => {
        handleNewUser({ result: result, provider: "google" });
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        const secret = credential?.secret;

        // The signed-in user info.
        const user = result.user;
        // Signed in
        router.push("/");
      })
      .catch((error) => {
        // Handle Errors here.
        const errorCode = error.code;
        const errorMessage = error.message;
        console.log(error);
        // The email of the user's account used.
        const email = error.customData.email;
        // The AuthCredential type that was used.
        const credential = GoogleAuthProvider.credentialFromError(error);
        return { error: error };
      });
  }

  async function logInTwitter() {
    return signInWithPopup(auth, twitterProvider)
      .then((result) => {
        handleNewUser({ result: result, provider: "twitter" });
        // This gives you a the Twitter OAuth 1.0 Access Token and Secret.
        // You can use these server side with your app's credentials to access the Twitter API.
        const credential = TwitterAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        const secret = credential?.secret;

        // The signed-in user info.
        const user = result.user;
        // Signed in
        router.push("/");
      })
      .catch((error) => {
        // Handle Errors here.
        const errorCode = error.code;
        const errorMessage = error.message;
        console.log(error);
        // The email of the user's account used.
        // The AuthCredential type that was used.
        const credential = TwitterAuthProvider.credentialFromError(error);
        return { error: error };
      });
  }

  async function logOut(): Promise<{ success: boolean; error?: string; }> {
    return signOut(auth)
      .then(() => {
        // Sign-out successful.
        router.push("/");
        return { success: true };
      })
      .catch((error) => {
        return { success: false, error: error };
      });
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentuser) => {
      // console.log("Auth", currentuser);
      updateCurrentUser(auth, currentuser).then(() => {
        setUser(currentuser);
        queryClient.invalidateQueries("user");
      });
    });
    return () => {
      unsubscribe();
    };
  }, [queryClient, setUser]);

  console.log("user", user);
  return {
    // createEmailUser,
    // handleSendEmailVerification,
    // handleVerifyEmail,
    logInEmail,
    // logInGoogle,
    // logInTwitter,
    logOut,
    user,
  };
}

// handleNewUser only adds a record to the postgres DB if the user is new
// to Firebase. If the user exists on Firebase but not in postgres this
// function will NOT RUN
function handleNewUser({ result, provider }: { result: UserCredential, provider: string }) {
  const { isNewUser } = getAdditionalUserInfo(result) || {};

  const user = result.user;
  if (isNewUser && provider === "twitter") {
    const name = `${user.displayName}_user${user.uid
      .split("")
      .slice(0, 7)
      .join("")}`;
    const uid = user.uid;
    apiClient.post("/user", { name: name, userId: uid });
  } else if (isNewUser && user.email) {
    const name = `${user.email.split("@")[0]}_user${user.uid
      .split("")
      .slice(0, 7)
      .join("")}`;
    const uid = user.uid;
    apiClient.post("/user", { name: name, userId: uid });
  }
}
