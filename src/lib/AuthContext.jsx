import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/api/client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  // First check shows the loading screen; later checks (sign-in in another tab, token refresh
  // after waking up) update quietly so the page you're on isn't torn down.
  const checkUserAuth = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoadingAuth(true);
    try {
      const me = await api.auth.me();
      setUser((prev) => (prev && prev.id === me.id && prev.role === me.role && prev.full_name === me.full_name ? prev : me));
      setIsAuthenticated(true);
    } catch {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      if (!quiet) setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
    return api.auth.onChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Don't call the auth client from inside its own callback.
        setTimeout(() => checkUserAuth({ quiet: true }), 0);
      }
    });
  }, [checkUserAuth]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    api.auth.logout(shouldRedirect ? '/login' : null);
  };

  const navigateToLogin = () => api.auth.redirectToLogin();

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError: null,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState: checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
