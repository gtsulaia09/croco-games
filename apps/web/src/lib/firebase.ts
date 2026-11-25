/**
 * Firebase Authentication, loaded lazily so the demo build without a backend never downloads it.
 * Credentials and passwords are handled exclusively by Firebase; the app only receives ID tokens.
 */
import type { Auth, User } from "@firebase/auth";
import type * as FirebaseAuth from "@firebase/auth";
import { config } from "./config";

let authPromise: Promise<{ auth: Auth; mod: typeof FirebaseAuth }> | null = null;

export function loadAuth() {
  authPromise ??= (async () => {
    const [{ initializeApp }, mod] = await Promise.all([import("@firebase/app"), import("@firebase/auth")]);
    const app = initializeApp({
      apiKey: config.firebase.apiKey,
      authDomain: config.firebase.authDomain,
      projectId: config.firebase.projectId,
      appId: config.firebase.appId || undefined,
    });
    // Firebase's own persistence (IndexedDB) — no tokens are written to localStorage by the app.
    const auth = mod.initializeAuth(app, {
      persistence: [mod.indexedDBLocalPersistence, mod.browserSessionPersistence],
      popupRedirectResolver: mod.browserPopupRedirectResolver,
    });
    return { auth, mod };
  })();
  return authPromise;
}

export async function signInWithProvider(kind: "google" | "facebook"): Promise<void> {
  const { auth, mod } = await loadAuth();
  const provider = kind === "google" ? new mod.GoogleAuthProvider() : new mod.FacebookAuthProvider();
  if (kind === "facebook") (provider as InstanceType<typeof mod.FacebookAuthProvider>).addScope("email");
  await mod.signInWithPopup(auth, provider);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { auth, mod } = await loadAuth();
  await mod.signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(email: string, password: string): Promise<void> {
  const { auth, mod } = await loadAuth();
  const cred = await mod.createUserWithEmailAndPassword(auth, email, password);
  await mod.sendEmailVerification(cred.user);
}

/** Always resolves the same way so the UI cannot reveal whether an email is registered. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { auth, mod } = await loadAuth();
  try {
    await mod.sendPasswordResetEmail(auth, email);
  } catch {
    /* intentionally ignored: no account enumeration */
  }
}

export async function resendVerification(): Promise<void> {
  const { auth, mod } = await loadAuth();
  if (auth.currentUser) await mod.sendEmailVerification(auth.currentUser);
}

export async function reloadUser(): Promise<User | null> {
  const { auth } = await loadAuth();
  await auth.currentUser?.reload();
  await auth.currentUser?.getIdToken(true);
  return auth.currentUser;
}

export async function getIdToken(force = false): Promise<string | null> {
  const { auth } = await loadAuth();
  return auth.currentUser ? auth.currentUser.getIdToken(force) : null;
}

export async function signOutFirebase(): Promise<void> {
  const { auth, mod } = await loadAuth();
  await mod.signOut(auth);
}

/** Re-authentication for sensitive operations (account deletion, admin MFA, role changes). */
export async function reauthenticate(password?: string): Promise<void> {
  const { auth, mod } = await loadAuth();
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");
  const providerId = user.providerData[0]?.providerId;
  if (providerId === "password") {
    if (!password || !user.email) throw new Error("password required");
    await mod.reauthenticateWithCredential(user, mod.EmailAuthProvider.credential(user.email, password));
  } else {
    const provider = providerId === "facebook.com" ? new mod.FacebookAuthProvider() : new mod.GoogleAuthProvider();
    await mod.reauthenticateWithPopup(user, provider);
  }
  await user.getIdToken(true);
}

export async function deleteFirebaseUser(): Promise<void> {
  const { auth, mod } = await loadAuth();
  if (auth.currentUser) await mod.deleteUser(auth.currentUser);
}

export async function onAuthChange(cb: (user: User | null) => void): Promise<() => void> {
  const { auth, mod } = await loadAuth();
  return mod.onIdTokenChanged(auth, cb);
}
