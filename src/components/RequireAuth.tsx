import React from "react";
import { useUser } from "../contexts/UserContext";
import Login from "../pages/Login";

export default function RequireAuth({
    children,
}: {
    children: React.ReactElement;
}) {
    const { user, loading } = useUser();

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
