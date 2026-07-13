import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PublicRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div class="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p class="text-sm tracking-wider font-light">Loading workspace...</p>
      </div>
    );
  }

  return !user ? <Outlet /> : <Navigate to="/" replace />;
};

export default PublicRoute;
