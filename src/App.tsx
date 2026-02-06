import RequireAuth from "./components/RequireAuth";
import StrategySuiteApp from "./StrategySuiteApp";

export default function App() {
    return (
        <RequireAuth>
            <StrategySuiteApp />
        </RequireAuth>
    );
}
