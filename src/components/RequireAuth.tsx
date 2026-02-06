import React, { useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth } from "../firebase";
import Login from "../pages/Login";

export default function RequireAuth({
    children,
}: {
    children: React.ReactElement;
}) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        return onAuthStateChanged(auth, (u) => {
            if (u && !u.emailVerified) {
                // We keep them logged in but RequireAuth returns <Login />
                // Login.tsx will show the "Please verify" message
                setUser(null);
            } else {
                setUser(u);
            }
            setLoading(false);
        });
    }, []);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 font-['Outfit']">
            <div className="p-8 text-center bg-white rounded-[40px] shadow-xl border border-gray-100 flex flex-col items-center gap-6">
                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Initializing Secure Session...</p>
            </div>
        </div>
    );

    if (!user) return <Login />;

    return children;
}
