import React from 'react';

interface State {
  failed: boolean;
}

/** Last line of defence: shows a reload screen instead of a blank page if something throws while rendering. */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Unexpected error:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-screen bg-[#0c0d0c] text-zinc-100 flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-sm space-y-4">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-sm text-zinc-400">The page hit an unexpected problem. Reloading usually fixes it.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-[#3fcf8e] text-black text-sm font-bold cursor-pointer"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
