import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import { combineReducers } from '@reduxjs/toolkit'

// Import slices
import authSlice from './slices/authSlice'
import teacherSlice from './slices/teacherSlice'
import studentSlice from './slices/studentSlice'
import subjectSlice from './slices/subjectSlice'
import datesheetSlice from './slices/datesheetSlice'
import roomSlice from './slices/roomSlice'
import dispatchSlice from './slices/dispatchSlice'

// Root reducer
const rootReducer = combineReducers({
  auth: authSlice,
  teachers: teacherSlice,
  students: studentSlice,
  subjects: subjectSlice,
  datesheets: datesheetSlice,
  rooms: roomSlice,
  dispatches: dispatchSlice,
})

// Persist configuration. Auth is not persisted here: the session lives in
// httpOnly cookies and the profile hint in utils/authStorage.
const persistConfig = {
  key: 'capabble-root',
  storage,
  whitelist: [] as string[],
  version: 2,
}

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer)

// Configure store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: import.meta.env.MODE !== 'production',
})

// Create persistor
export const persistor = persistStore(store)

// Export types
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// Export store as default
export default store