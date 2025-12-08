import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setLocation("/dashboard"), 500);
          return 100;
        }
        return prev + 2;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [setLocation]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-800 via-gray-900 to-black relative overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{
          backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"1920\" height=\"1080\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cdefs%3E%3ClinearGradient id=\"a\" x1=\"0%25\" y1=\"0%25\" x2=\"100%25\" y2=\"100%25\"%3E%3Cstop offset=\"0%25\" stop-color=\"%23667eea\"/%3E%3Cstop offset=\"100%25\" stop-color=\"%23764ba2\"/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath fill=\"url(%23a)\" d=\"M0 0h1920v1080H0z\"/%3E%3C/svg%3E')"
        }}
      />

      {/* Car silhouette effect */}
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-black to-transparent" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        {/* Logo */}
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white">Loading ProfitDock...</h2>
        </div>

        {/* Loading text and progress */}
        <div className="w-full max-w-2xl">
          <p className="text-white text-center mb-4 text-lg">
            Fetching real-time market data...
          </p>

          {/* Progress bar */}
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Progress percentage */}
          <p className="text-cyan-400 text-center mt-3 text-2xl font-bold">
            {progress}%
          </p>
        </div>

        {/* Copyright */}
        <p className="text-gray-400 text-sm mt-8">
          © 2024 ProfitDock. All rights reserved.
        </p>
      </div>
    </div>
  );
}
