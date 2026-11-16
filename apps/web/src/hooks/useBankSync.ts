import { useCallback, useEffect, useState } from 'react'
import type { BankConnection, CreateBankConnectionInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { pairExtension, sendToBridge, subscribeToBridge, type SyncStatus } from '../lib/extensionBridge'

/**
 * Everything Bank Sync needs from the app side: the connection list (our
 * REST API) plus the bridge state (extension pairing, live sync status).
 *
 * The flow is fully manual: "Sync" opens the bank's sign-on URL in a popup,
 * the user logs in and downloads the CSV themselves, and the extension
 * captures that one download, uploads it and reports back — at which point
 * the caller (the overlay) navigates to the import review.
 */

export type PendingReview = {
  reviewId: string
  connectionId: string
  accountId: string
  uploadedFileId: string | null
  fileName: string
}

export function useBankSync(navigateOnComplete?: boolean) {
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pairing, setPairing] = useState<'unknown' | 'paired' | 'not-installed' | 'failed'>('unknown')
  const [pairError, setPairError] = useState<string | null>(null)
  const [activeSync, setActiveSync] = useState<SyncStatus | null>(null)
  const [fileAccess, setFileAccess] = useState<boolean | null>(null)
  /**
   * Last sync failure per connection, persisted in localStorage: the status
   * widget is ephemeral, but a sync the user waited for should leave a trace
   * until the next attempt (cleared on 'complete').
   */
  const [lastFailures, setLastFailures] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('finai-sync-failures') ?? '{}')
    } catch {
      return {}
    }
  })

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setConnections(await apiClient.get<BankConnection[]>('/bank-connections'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bank connections')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const unsubscribe = subscribeToBridge((message) => {
      switch (message.kind) {
        case 'finai:bridge-ready': {
          void pairExtension()
          break
        }
        case 'finai:pairing-accepted': {
          setPairing('paired')
          break
        }
        case 'finai:pair-error': {
          setPairing('failed')
          setPairError(message.errorMessage)
          break
        }
        case 'finai:file-access': {
          setFileAccess(message.allowed)
          break
        }
        case 'finai:sync-status': {
          setActiveSync({
            connectionId: message.connectionId,
            accountId: message.accountId,
            status: message.status,
            stepLabel: message.message,
            errorMessage: message.errorMessage,
            uploadedFileId: message.uploadedFileId,
            fileName: message.fileName,
          })
          if (message.status === 'failed') {
            const reason = message.errorMessage || message.message || 'Sync failed'
            setLastFailures((prev) => {
              const next = { ...prev, [message.connectionId]: reason }
              try {
                localStorage.setItem('finai-sync-failures', JSON.stringify(next))
              } catch {
                // storage full/unavailable — the widget still shows it
              }
              return next
            })
          }
          if (message.status === 'complete') {
            setLastFailures((prev) => {
              if (!(message.connectionId in prev)) return prev
              const next = { ...prev }
              delete next[message.connectionId]
              try {
                localStorage.setItem('finai-sync-failures', JSON.stringify(next))
              } catch {
                // storage full/unavailable — the widget still shows it
              }
              return next
            })
          }
          if (['complete', 'failed', 'cancel'].includes(message.status)) {
            // The connection row's lastSyncedAt may have changed server-side.
            void refresh()
          }
          if (message.status === 'complete' && navigateOnComplete && message.uploadedFileId) {
            window.dispatchEvent(
              new CustomEvent('finai-bank-sync-captured', {
                detail: {
                  uploadedFileId: message.uploadedFileId,
                  fileName: message.fileName,
                  accountId: message.accountId,
                },
              }),
            )
          }
          if (['complete', 'failed', 'cancel'].includes(message.status)) {
            // Failures linger longer than successes — a sync the user waited
            // for deserves time to be read.
            const ttl = message.status === 'failed' ? 30000 : 6000
            setTimeout(() => setActiveSync((current) => (current?.connectionId === message.connectionId ? null : current)), ttl)
          }
          break
        }
        default:
          break
      }
    })
    return unsubscribe
  }, [refresh, navigateOnComplete])

  // Initial detection: if the extension is present, `bridge-ready` arrives
  // quickly; report "not installed" when it doesn't.
  useEffect(() => {
    void pairExtension()
    const timer = setTimeout(() => {
      setPairing((state) => (state === 'unknown' ? 'not-installed' : state))
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  const createConnection = useCallback(async (input: CreateBankConnectionInput) => {
    const connection = await apiClient.post<BankConnection>('/bank-connections', input)
    await refresh()
    return connection
  }, [refresh])

  const disconnectConnection = useCallback(async (id: string) => {
    await apiClient.patch(`/bank-connections/${id}/disconnect`)
    await refresh()
  }, [refresh])

  const startSync = useCallback((connection: BankConnection) => {
    const origin = new URL(connection.loginUrl).origin
    sendToBridge({ kind: 'finai:start-sync', connectionId: connection.id, originPattern: `${origin}/*` })
  }, [])

  const startSyncById = useCallback(
    (connectionId: string) => {
      const connection = connections.find((c) => c.id === connectionId)
      if (connection) startSync(connection)
    },
    [connections, startSync],
  )

  const cancelSync = useCallback((connectionId: string) => {
    sendToBridge({ kind: 'finai:cancel-sync', connectionId })
  }, [])

  const connectionFor = useCallback(
    (accountId: string) => connections.find((c) => c.accountId === accountId && c.status === 'active') ?? null,
    [connections],
  )

  return {
    connections,
    loading,
    error,
    refresh,
    pairing,
    pairError,
    fileAccess,
    lastFailures,
    activeSync,
    createConnection,
    disconnectConnection,
    startSync,
    startSyncById,
    cancelSync,
    connectionFor,
  }
}
