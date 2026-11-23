import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Ocurrió un error inesperado.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080809] text-[#f5f3f3] flex items-center justify-center p-6">
          <div className="max-w-md w-full border border-white/15 bg-[#111113] p-6 space-y-4">
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#f02b49] uppercase">
              SMOKK · ERROR DEL SISTEMA
            </p>
            <h1 className="text-3xl font-black tracking-tight font-['Barlow_Condensed']">
              ALGO SALIÓ MAL
            </h1>
            <p className="text-sm text-[#aaa6aa] leading-relaxed">
              No se pudo completar la operación. Recargá la página para volver a intentarlo.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-[#c10e2e] hover:bg-[#e0163a] text-white text-xs font-extrabold tracking-[0.14em] uppercase transition-colors"
            >
              RECARGAR PÁGINA
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
