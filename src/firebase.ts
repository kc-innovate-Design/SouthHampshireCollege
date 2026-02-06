import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Defensive initialization
let app: any = null;
let auth: any = null;

const firebaseConfig = {
    apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY,
    authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID,
    appId: (import.meta as any).env.VITE_FIREBASE_APP_ID,
};

try {
    if (firebaseConfig.apiKey) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
    } else {
        console.warn("Firebase API Key missing. Authentication will not work.");
    }
} catch (error) {
    console.error("Firebase failed to initialize:", error);
}

export { auth };
