import { User } from '../types';

const API_BASE = '/api/auth';
const STORAGE_SESSION_KEY = 'simpletrack_session';
const STORAGE_USERS_KEY = 'simpletrack_local_users';

// Fast check to see if backend is responsive
const checkBackend = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);
    // Use a simple health check or root instead of /login OPTIONS which might be restricted
    await fetch('/api/health', { method: 'GET', signal: controller.signal }).catch(() => {});
    clearTimeout(timeoutId);
    return false; // Forcing local mode for preview stability unless explicitly running server
  } catch (e) {
    return false;
  }
};

export const register = async (username: string, password: string): Promise<User | null> => {
  // Local Fallback Logic for Previews
  const localUsers = JSON.parse(localStorage.getItem(STORAGE_USERS_KEY) || '[]');
  if (localUsers.find((u: any) => u.username === username)) return null;
  
  const newUser = { id: Math.random().toString(36).substr(2, 9), username };
  localUsers.push({ ...newUser, password }); 
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(localUsers));
  localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(newUser));
  return newUser;
};

export const login = async (username: string, password: string): Promise<User | null> => {
  // Hardcoded bypass for admin/admin as requested
  if (username === 'admin' && password === 'admin') {
    const adminUser = { id: 'admin-id', username: 'admin' };
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(adminUser));
    return adminUser;
  }

  // Local Fallback Logic for Previews
  const localUsers = JSON.parse(localStorage.getItem(STORAGE_USERS_KEY) || '[]');
  const user = localUsers.find((u: any) => u.username === username && u.password === password);
  if (user) {
    const sessionUser = { id: user.id, username: user.username };
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(sessionUser));
    return sessionUser;
  }
  return null;
};

export const changePassword = async (username: string, oldPass: string, newPass: string): Promise<boolean> => {
  const localUsers = JSON.parse(localStorage.getItem(STORAGE_USERS_KEY) || '[]');
  const userIndex = localUsers.findIndex((u: any) => u.username === username && u.password === oldPass);
  if (userIndex !== -1) {
    localUsers[userIndex].password = newPass;
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(localUsers));
    return true;
  }
  return false;
};

export const logout = () => {
  localStorage.removeItem(STORAGE_SESSION_KEY);
};

export const getSession = (): User | null => {
  const session = localStorage.getItem(STORAGE_SESSION_KEY);
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
};