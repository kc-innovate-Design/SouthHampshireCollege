import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// Defensive initialization
let app: any = null;
let auth: any = null;
let db: any = null;

try {
    const env = (import.meta as any).env;
    if (env && env.VITE_FIREBASE_API_KEY) {
        const firebaseConfig = {
            apiKey: env.VITE_FIREBASE_API_KEY,
            authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: env.VITE_FIREBASE_PROJECT_ID,
            appId: env.VITE_FIREBASE_APP_ID,
        };
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        // Use auto-detect long polling for Cloud Run compatibility
        db = initializeFirestore(app, {
            experimentalAutoDetectLongPolling: true,
        });
    } else {
        const missing = [
            !env.VITE_FIREBASE_API_KEY && "VITE_FIREBASE_API_KEY",
            !env.VITE_FIREBASE_AUTH_DOMAIN && "VITE_FIREBASE_AUTH_DOMAIN",
            !env.VITE_FIREBASE_PROJECT_ID && "VITE_FIREBASE_PROJECT_ID",
            !env.VITE_FIREBASE_APP_ID && "VITE_FIREBASE_APP_ID"
        ].filter(Boolean);
        console.warn("Firebase configuration missing: ", missing.join(", "));
    }
} catch (error) {
    console.error("Firebase failed to initialize:", error);
}

export { auth, db };

