// @ts-nocheck
import React from 'react';

export class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  state = { hasError: false, error: null };

  constructor(props: any) {
    super(props);
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-500 bg-red-50 border border-red-200 rounded-xl m-4">
          <h2 className="font-bold text-lg mb-2">Terjadi Kesalahan (Crash)</h2>
          <pre className="text-xs overflow-auto p-4 bg-white rounded border border-red-100">{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
