import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Trash2, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught critical application error]:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6 font-sans select-none">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-red-600/20 text-red-400 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-white tracking-tight">
                BillSync Pro - Error Recovery
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                An unexpected display error occurred. Your stored business data is safely preserved in local offline storage.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-left font-mono text-[11px] text-red-300 max-h-36 overflow-y-auto whitespace-pre-wrap break-words">
                {this.state.error.toString()}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs py-3.5 px-4 rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>

              <button
                onClick={this.handleResetCache}
                className="w-full bg-slate-800 hover:bg-red-950/60 hover:text-red-300 border border-slate-700 hover:border-red-800 text-slate-300 font-bold text-xs py-3.5 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Cache & Reset</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
