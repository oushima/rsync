import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onReset: () => void;
}

function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const { t } = useTranslation();
  
  return (
    <div 
      role="alert"
      className="flex items-center justify-center min-h-screen bg-bg-secondary p-6"
    >
      <div className="max-w-md w-full rounded-3xl bg-bg-primary border border-border-subtle shadow-lg p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-error" strokeWidth={1.75} />
        </div>
        
        <h1 className="text-xl font-semibold text-text-primary mb-2">
          {t('errorBoundary.title')}
        </h1>
        
        <p className="text-[15px] text-text-secondary mb-6">
          {t('errorBoundary.message')}
        </p>
        
        {error && (
          <div className="bg-bg-tertiary rounded-xl p-4 mb-6 text-left">
            <p className="text-[13px] text-text-tertiary font-mono wrap-break-word">
              {error.message}
            </p>
          </div>
        )}
        
        <button
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-accent text-white font-medium text-[14px] hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        >
          <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
          {t('errorBoundary.retry')}
        </button>
      </div>
    </div>
  );
}
