import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { captureError } from '../lib/monitoring';

/** Catches render errors, reports them, and offers a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { area: 'render', component: info.componentStack?.split('\n')[1]?.trim() ?? 'unknown' });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="card" style={{ maxWidth: 440 }}>
          <h1 className="section-title">Something went wrong</h1>
          <p className="muted">
            The page hit an error and has been reported. Your training is saved on this device and is not affected.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                window.location.hash = 'today';
                this.setState({ failed: false });
              }}
            >
              Back to Today
            </button>
          </div>
        </div>
      </div>
    );
  }
}
