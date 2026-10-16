import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from '../api/auth.js'
import { SESSION_EXPIRED, describeError, tokens } from '../api/client.js'
import { homePathFor } from '../utils/nav.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => tokens.user())
  const [ready, setReady] = useState(() => !tokens.access())
  const [authenticated, setAuthenticated] = useState(() => Boolean(tokens.access()))

  const refreshUser = useCallback(async () => {
    if (!tokens.access()) {
      setUser(null)
      setAuthenticated(false)
      setReady(true)
      return null
    }
    try {
      const me = await authApi.fetchMe()
      tokens.setUser(me)
      setUser(me)
      setAuthenticated(true)
      return me
    } catch (error) {
      if (error?.response?.status === 401) {
        tokens.clear()
        setUser(null)
        setAuthenticated(false)
      }
      return null
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  useEffect(() => {
    function onSessionExpired() {
      setUser(null)
      setAuthenticated(false)
    }
    window.addEventListener(SESSION_EXPIRED, onSessionExpired)
    return () => window.removeEventListener(SESSION_EXPIRED, onSessionExpired)
  }, [])

  const login = useCallback(
    async (credentials) => {
      const data = await authApi.login(credentials)
      setUser(data.user)
      setAuthenticated(true)
      setReady(true)
      return data.user
    },
    []
  )

  const register = useCallback(async (payload) => {
    const data = await authApi.register(payload)
    tokens.save({ access: data.access, refresh: data.refresh, user: data.user })
    setUser(data.user)
    setAuthenticated(true)
    return data.user
  }, [])

  /**
   * Clears the credentials held by this browser. The backend issues stateless
   * JWTs and has no blocklist, so an already-issued token remains valid until it
   * expires — see BACKEND_FOLLOWUPS.md.
   */
  const logout = useCallback(() => {
    authApi.logout()
    setUser(null)
    setAuthenticated(false)
  }, [])

  const saveProfile = useCallback(
    async (payload) => {
      const me = await authApi.updateProfile(payload)
      tokens.setUser(me)
      setUser(me)
      return me
    },
    []
  )

  const value = useMemo(
    () => ({
      user,
      ready,
      authenticated,
      role: user?.role ?? null,
      isGuest: ready && !authenticated,
      login,
      register,
      logout,
      refreshUser,
      saveProfile,
      homePath: homePathFor(user),
      errorMessage: describeError,
    }),
    [user, ready, authenticated, login, register, logout, refreshUser, saveProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
