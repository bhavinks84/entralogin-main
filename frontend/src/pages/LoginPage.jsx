import { useLocation, Link } from 'react-router-dom';
import { authService } from '../services/authService';

// ── LoginPage ─────────────────────────────
export default function LoginPage() {
  const location  = useLocation();
  const from      = location.state?.from?.pathname || '/dashboard';

  // Search params – check for errors from Entra callback
  const searchParams = new URLSearchParams(location.search);
  const urlError     = searchParams.get('error');

  const handleMicrosoftSignIn = () => {
    authService.loginWithEntra();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-center text-2xl font-bold text-gray-900">Welcome back</h1>
        <p className="mb-6 text-center text-sm text-gray-500">Sign in with your Entra account</p>

        {urlError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Sign-in error: {decodeURIComponent(urlError)}
          </div>
        )}

        <div className="space-y-4">
          <p className="text-center text-sm text-gray-600">
            Use Microsoft sign-in. If you are new, register first to provision your Entra account.
          </p>
          <button
            onClick={handleMicrosoftSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-primary-600 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
