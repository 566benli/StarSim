/**
 * ErrorBoundary - Catches React errors and shows a friendly message
 * with diagnostics so users can report issues.
 */
import React from 'react';

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[GenesisError] UI Error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || 'Unknown error';
      const isWebGL = /webgl|context|gpu|canvas|renderer/i.test(errMsg);
      const isNetwork = /fetch|network|cors|econnrefused|timeout/i.test(errMsg);

      return (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: '#0a0a1a', color: '#e8e8ff', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 40, fontFamily: 'Segoe UI', textAlign: 'center', zIndex: 99999,
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✦</div>
          <h1 style={{ fontSize: 24, marginBottom: 12, color: '#00ccff' }}>Genesis Error</h1>
          <p style={{ fontSize: 16, color: '#8888bb', maxWidth: 500, marginBottom: 16 }}>
            Something went wrong while loading the application.
          </p>
          {isWebGL && (
            <p style={{ fontSize: 14, color: '#ffaa44', maxWidth: 500, marginBottom: 16 }}>
              Your graphics card or driver may not support WebGL.<br />
              Try updating your GPU drivers or enabling hardware acceleration in your browser/system settings.
            </p>
          )}
          {isNetwork && (
            <p style={{ fontSize: 14, color: '#ffaa44', maxWidth: 500, marginBottom: 16 }}>
              A network error occurred. Genesis Error works offline — this may resolve on restart.
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px', fontSize: 14, background: 'linear-gradient(135deg, #4488ff, #00ccff)',
                border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer',
              }}
            >
              Restart
            </button>
            <button
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              style={{
                padding: '12px 24px', fontSize: 14, background: 'transparent',
                border: '1px solid #444', borderRadius: 8, color: '#8888bb', cursor: 'pointer',
              }}
            >
              {this.state.showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>
          {this.state.showDetails && (
            <pre style={{
              textAlign: 'left', fontSize: 12, color: '#ff6688', background: '#111', padding: 16,
              borderRadius: 8, maxWidth: 600, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', border: '1px solid #333',
            }}>
              {errMsg}
              {this.state.error?.stack ? '\n\n' + this.state.error.stack.split('\n').slice(0, 8).join('\n') : ''}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
