import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth as authApi } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('styleos_token');
    if (token) {
      authApi.me()
        .then(({ user }) => {
          setUser(user);
          connectSocket(user.id);
        })
        .catch(() => {
          localStorage.removeItem('styleos_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    localStorage.setItem('styleos_token', token);
    setUser(user);
    connectSocket(user.id);
    return user;
  };

  const register = async (name, email, password) => {
    const { token, user } = await authApi.register(name, email, password);
    localStorage.setItem('styleos_token', token);
    setUser(user);
    connectSocket(user.id);
    return user;
  };

  const logout = () => {
    localStorage.removeItem('styleos_token');
    setUser(null);
    disconnectSocket();
  };

  const loginWithToken = (token, user) => {
    localStorage.setItem('styleos_token', token);
    setUser(user);
    connectSocket(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loginWithToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
