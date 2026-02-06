import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// Defensive initialization
let app: any = null;
let auth: any = null;
let db: any = null;

// Vite requires DIRECT static access to import.meta.env.VITE_* for build-time replacement
// DO NOT store import.meta.env in a variable - it breaks the substitution!
const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;
const FIREBASE_AUTH_DOMAIN = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_APP_ID = import.meta.env.VITE_FIREBASE_APP_ID;

try {
    console.log('🔥 Firebase Init - API Key present:', !!FIREBASE_API_KEY);
    console.log('🔥 Firebase Init - Project ID:', FIREBASE_PROJECT_ID || 'MISSING');

    if (FIREBASE_API_KEY) {
        const firebaseConfig = {
            apiKey: FIREBASE_API_KEY,
            authDomain: FIREBASE_AUTH_DOMAIN,
            projectId: FIREBASE_PROJECT_ID,
            appId: FIREBASE_APP_ID,
        };
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        // Use forced long polling for Cloud Run compatibility
        db = initializeFirestore(app, {
            experimentalForceLongPolling: true,
        });
        console.log('✅ Firebase initialized successfully');
    } else {
        const missing = [
            !FIREBASE_API_KEY && "VITE_FIREBASE_API_KEY",
            !FIREBASE_AUTH_DOMAIN && "VITE_FIREBASE_AUTH_DOMAIN",
            !FIREBASE_PROJECT_ID && "VITE_FIREBASE_PROJECT_ID",
            !FIREBASE_APP_ID && "VITE_FIREBASE_APP_ID"
        ].filter(Boolean);
        console.warn("Firebase configuration missing:", missing.join(", "));
    }
} catch (error) {
    console.error("Firebase failed to initialize:", error);
}

export { auth, db };
