import React, { Suspense, lazy } from "react";
import RequireAuth from "./components/RequireAuth";

// Lazy load the main app component to reduce initial bundle size
const StrategySuiteApp = lazy(() => import("./StrategySuiteApp"));

export default function App() {
    return (
        <RequireAuth>
            <Suspense fallback={
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="p-8 text-center flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Loading Strategic Tools...</p>
                    </div>
                </div>
            }>
                <StrategySuiteApp />
            </Suspense>
        </RequireAuth>
    );
}
