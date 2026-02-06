import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function LogoutButton() {
    return (
        <button
            onClick={() => signOut(auth)}
            className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline"
        >
            Log out
        </button>
    );
}
