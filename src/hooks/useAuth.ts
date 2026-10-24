import { useState, useEffect } from 'react';
import { User } from '../types';
import { safeStorage } from '../utils/storage';
import { DEFAULT_USERS, DEMO_USER_PHONE } from '../utils/demoData';
import { db } from '../db';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<string>(() => {
    return safeStorage.getItem('current_user') || '';
  });

  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'clerk'>(() => {
    return (safeStorage.getItem('current_user_role') as 'admin' | 'clerk') || 'admin';
  });

  const [registeredUsers, setRegisteredUsers] = useState<User[]>(() => {
    try {
      const stored = safeStorage.getItem('registered_users');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Keep registered users in sync with Dexie & safeStorage
  useEffect(() => {
    safeStorage.setItem('registered_users', JSON.stringify(registeredUsers));
    safeStorage.setItem('current_user', currentUser);
    safeStorage.setItem('current_user_role', currentUserRole);

    db.users.bulkPut(registeredUsers).catch(err => {
      console.warn("Failed to sync users to Dexie", err);
    });
  }, [registeredUsers, currentUser, currentUserRole]);

  const activeUserData = registeredUsers.find(u => u.phone === currentUser) || {
    phone: currentUser,
    password: "",
    businessName: "My Billing Store",
    gstin: "",
    upiId: "",
    clerkPassword: "clerk"
  };

  const loginUser = (phone: string, pass: string): { success: boolean; message: string } => {
    const found = registeredUsers.find(u => u.phone === phone);
    if (!found) {
      return { success: false, message: "Mobile number not registered!" };
    }
    if (found.password !== pass) {
      return { success: false, message: "Incorrect password!" };
    }
    setCurrentUser(phone);
    setCurrentUserRole('admin');
    return { success: true, message: "Login successful!" };
  };

  const registerUser = (phone: string, pass: string, businessName: string): { success: boolean; message: string } => {
    if (!phone || phone.length < 10) {
      return { success: false, message: "Please enter a valid 10-digit mobile number!" };
    }
    if (registeredUsers.some(u => u.phone === phone)) {
      return { success: false, message: "Mobile number already registered!" };
    }
    const newUser: User = {
      phone,
      password: pass,
      businessName,
      gstin: "",
      upiId: "",
      clerkPassword: "clerk"
    };
    setRegisteredUsers(prev => [...prev, newUser]);
    setCurrentUser(phone);
    setCurrentUserRole('admin');
    return { success: true, message: "Registration successful!" };
  };

  const logoutUser = () => {
    setCurrentUser(DEMO_USER_PHONE);
    setCurrentUserRole('admin');
  };

  const setRole = (role: 'admin' | 'clerk') => {
    setCurrentUserRole(role);
  };

  const updateBusinessProfile = (businessName: string, gstin?: string, upiId?: string, clerkPassword?: string) => {
    setRegisteredUsers(prev => prev.map(u => {
      if (u.phone === currentUser) {
        return {
          ...u,
          businessName,
          gstin: gstin ?? u.gstin,
          upiId: upiId ?? u.upiId,
          clerkPassword: clerkPassword ?? u.clerkPassword
        };
      }
      return u;
    }));
  };

  return {
    currentUser,
    currentUserRole,
    registeredUsers,
    activeUserData,
    loginUser,
    registerUser,
    logoutUser,
    setRole,
    updateBusinessProfile,
    isDemoUser: currentUser === DEMO_USER_PHONE
  };
}
