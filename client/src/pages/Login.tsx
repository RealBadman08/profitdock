import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function Login() {
  const { isAuthenticated, login, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation('/trading');
    }
  }, [isAuthenticated, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C026D3] mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-cyan-400">PROFIT</span>
            <span className="text-fuchsia-600">DOCK</span>
          </h1>
          <p className="text-gray-400">Professional Deriv Trading Interface</p>
        </div>

        <div className="bg-[#2A2A2A] rounded-2xl p-8 border border-gray-800">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
          <p className="text-gray-400 mb-6">Login with your Deriv account to start trading</p>

          <Button
            onClick={login}
            className="w-full h-12 bg-[#C026D3] hover:bg-[#A021B3] text-white font-semibold text-lg"
          >
            Login with Deriv
          </Button>

          <div className="mt-6 p-4 bg-[#1A1A1A] rounded-lg border border-gray-800">
            <p className="text-gray-400 text-sm">
              <strong className="text-white">Note:</strong> You'll be redirected to Deriv's secure login page.
              After authorization, you'll be brought back to ProfitDock.
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm">
            Don't have a Deriv account?{' '}
            <a
              href="https://deriv.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C026D3] hover:text-[#A021B3] font-medium"
            >
              Sign up here
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
