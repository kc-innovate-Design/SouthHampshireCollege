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

    if (loading) return null;

    if (!user) return <Login />;

    return children;
}
