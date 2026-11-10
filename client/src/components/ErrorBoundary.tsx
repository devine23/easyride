import React, { Component, ErrorInfo, ReactNode } from 'react'
import * as Sentry from '@sentry/react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-vh-100 bg-900 d-flex align-items-center justify-content-center p-4">
          <div className="card p-5 text-center" style={{ maxWidth: 400, width: '100%' }}>
            <div
              className="d-flex align-items-center justify-content-center rounded-circle mx-auto mb-4"
              style={{ width: 64, height: 64, background: 'rgba(239,68,68,0.15)' }}
            >
              <span style={{ fontSize: '1.75rem' }}>⚠️</span>
            </div>
            <h3 className="fw-bold fs-5 mb-2">Something went wrong</h3>
            <p className="text-muted small mb-4">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary w-100"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
