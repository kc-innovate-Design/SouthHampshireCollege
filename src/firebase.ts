import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Defensive initialization
let app;
let auth: any;

try {
    if (!firebaseConfig.apiKey) {
        console.warn("Firebase API Key missing. Authentication will not work.");
        // We initialize with dummy to avoid crashes later if possible, 
        // or just let it fail gracefully in components.
    }
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
} catch (error) {
    console.error("Firebase failed to initialize:", error);
}

export { auth };
