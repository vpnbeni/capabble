import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { User, LoginCredentials, AuthResponse, PasswordChangeData, ApiResponse } from "../../types/auth";
import authService from "../../services/authService";
import { clearAuthData, getRememberPreference, getStoredUser, setStoredUser } from "../../utils/authStorage";

/**
 * Who is signed in. The session itself is an httpOnly cookie the browser sends
 * automatically; `user` (with kind and permissions) drives what the UI shows.
 * The server checks every request, so this state is never the security boundary.
 */
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** True until the first `/auth/me` check after page load has finished. */
  checkingSession: boolean;
  loading: boolean;
  error: string | null;
}

const getInitialState = (): AuthState => {
  const user = getStoredUser<User>();
  return {
    user,
    isAuthenticated: Boolean(user),
    checkingSession: Boolean(user),
    loading: false,
    error: null,
  };
};

const initialState: AuthState = getInitialState();

const ACADEMIC_SESSION_STORAGE_KEY = 'capabble-academic-session';

const withBilling = (data: AuthResponse["data"]): User => ({
  ...data.user,
  ...(data.billing ? { billing: data.billing } : {}),
});

const clearSessionKeys = () => {
  clearAuthData();
  localStorage.removeItem(ACADEMIC_SESSION_STORAGE_KEY);
};

export const login = createAsyncThunk<AuthResponse, LoginCredentials>(
  "auth/login",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await authService.login({ ...credentials, rememberMe: getRememberPreference() });
      setStoredUser(withBilling(response.data));
      return response;
    } catch (error: any) {
      const data = error.response?.data;
      return rejectWithValue(data?.message || data?.error || "Sign-in failed. Please try again.");
    }
  }
);

export const logout = createAsyncThunk(
  "auth/logout",
  async () => {
    try {
      await authService.logout();
    } finally {
      clearSessionKeys();
      localStorage.removeItem('tenantSlug');
    }
    return null;
  }
);

export const getCurrentUser = createAsyncThunk<ApiResponse<User>>(
  "auth/getCurrentUser",
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getCurrentUser();
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || "Failed to get user");
    }
  }
);

export const updateProfile = createAsyncThunk<ApiResponse<User>, { name?: string }>(
  "auth/updateProfile",
  async (userData, { rejectWithValue }) => {
    try {
      const response = await authService.updateProfile(userData);
      if (response.data) {
        setStoredUser(response.data);
      }
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || "Profile update failed");
    }
  }
);

/** Change password. Other devices are signed out; this one gets a fresh session. */
export const changePassword = createAsyncThunk<AuthResponse, PasswordChangeData>(
  "auth/changePassword",
  async (passwordData, { rejectWithValue }) => {
    try {
      const response = await authService.changePassword(passwordData);
      setStoredUser(withBilling(response.data));
      return response;
    } catch (error: any) {
      const data = error.response?.data;
      return rejectWithValue(data?.message || data?.error || "Password change failed");
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    /** A response that already signed the user in (invite, email verification, signup). */
    setSignedInUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.checkingSession = false;
      state.error = null;
      setStoredUser(action.payload);
    },
    sessionRefreshed: (state, action: PayloadAction<User>) => {
      state.user = { ...action.payload, billing: action.payload.billing ?? state.user?.billing ?? null };
      state.isAuthenticated = true;
    },
    passwordChangeRequired: (state) => {
      if (state.user) state.user.mustChangePassword = true;
    },
    clearCredentials: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.checkingSession = false;
      state.error = null;
      clearSessionKeys();
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = withBilling(action.payload.data);
        state.isAuthenticated = true;
        state.checkingSession = false;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    builder
      .addCase(logout.pending, (state) => {
        state.loading = true;
      })
      .addCase(logout.fulfilled, (state) => {
        state.loading = false;
        state.user = null;
        state.isAuthenticated = false;
        state.error = null;
      })
      .addCase(logout.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.isAuthenticated = false;
      });

    builder
      .addCase(getCurrentUser.pending, (state) => {
        state.error = null;
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.checkingSession = false;
        if (action.payload.data) {
          state.user = action.payload.data;
          state.isAuthenticated = true;
          state.error = null;
          setStoredUser(action.payload.data);
        }
      })
      .addCase(getCurrentUser.rejected, (state, action) => {
        state.checkingSession = false;
        state.error = action.payload as string;
        state.user = null;
        state.isAuthenticated = false;
        clearSessionKeys();
      });

    builder
      .addCase(updateProfile.fulfilled, (state, action) => {
        if (action.payload.data) {
          state.user = action.payload.data;
        }
      });

    builder
      .addCase(changePassword.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.user = withBilling(action.payload.data);
        state.isAuthenticated = true;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearError, setSignedInUser, clearCredentials, setLoading } = authSlice.actions;

export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectIsAuthenticated = (state: { auth: AuthState }) => state.auth.isAuthenticated;
export const selectAuthLoading = (state: { auth: AuthState }) => state.auth.loading;
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error;
export const selectBillingSnapshot = (state: { auth: AuthState }) => state.auth.user?.billing ?? null;

export default authSlice.reducer;
