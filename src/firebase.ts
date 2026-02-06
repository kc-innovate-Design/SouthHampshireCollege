import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Defensive initialization
let app: any = null;
let auth: any = null;

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
    } else {
        console.warn("Firebase configuration missing in environment.");
    }
} catch (error) {
    console.error("Firebase failed to initialize:", error);
}

export { auth };
