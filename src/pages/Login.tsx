import React, { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth } from "../firebase";
import { isAllowedEmailDomain } from "../utils/emailDomain";

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ text: string, type: 'error' | 'success' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!auth) {
      setMessage({ text: "Authentication is not configured on this server. Please set VITE_FIREBASE_* environment variables.", type: 'error' });
      return;
    }

    if (!isAllowedEmailDomain(email)) {
      setMessage({ text: "This email domain is not authorised.", type: 'error' });
      return;
    }

    try {
      setLoading(true);
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user, {
          url: window.location.origin,
          handleCodeInApp: false,
        });
        setMessage({ text: "Account created! Please check your email to verify your account before signing in.", type: 'success' });
        setIsSignUp(false);
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          setMessage({ text: "Please verify your email address before signing in. Check your inbox.", type: 'error' });
          // Optional: we could sign them out here or let RequireAuth handle it
        }
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setMessage(null);
    if (!auth) {
      setMessage({ text: "Authentication not configured.", type: 'error' });
      return;
    }
    if (!email) {
      setMessage({ text: "Please enter your email address first.", type: 'error' });
      return;
    }
    if (!isAllowedEmailDomain(email)) {
      setMessage({ text: "This email domain is not authorised.", type: 'error' });
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage({ text: "Password reset email sent. Check your inbox.", type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-block p-4 rounded-3xl bg-white shadow-xl shadow-indigo-100 mb-6 transform hover:rotate-6 transition-transform duration-300">
            <svg className="w-12 h-12 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">StrategySuite</h1>
          <p className="text-gray-500 mt-2 font-medium">
            {isSignUp ? "Join the strategic elite" : "Empowering your strategic journey"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-indigo-100 overflow-hidden border border-white/20">
          <div className="p-8 md:p-10">
            <form onSubmit={handleAuth} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Email Address</label>
                <input
                  type="email"
                  placeholder="name@company.com"
                  className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl transition-all duration-300 outline-none text-gray-900 font-medium placeholder:text-gray-300"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl transition-all duration-300 outline-none text-gray-900 font-medium placeholder:text-gray-300"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {message && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${message.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                  <span className="text-sm font-semibold leading-relaxed">{message.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <span>{isSignUp ? "Create Account" : "Sign In"}</span>
                )}
              </button>
            </form>

            <div className="mt-8 flex flex-col items-center gap-4">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors"
                disabled={loading}
              >
                {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
              </button>

              {!isSignUp && (
                <button
                  onClick={handleForgotPassword}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-600 transition-colors uppercase tracking-widest"
                  disabled={loading}
                >
                  Forgot your password?
                </button>
              )}
            </div>
          </div>

          <div className="bg-gray-50/50 p-6 border-t border-gray-100 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Authorized Access Only</p>
          </div>
        </div>
      </div>
    </div>
  );
}
