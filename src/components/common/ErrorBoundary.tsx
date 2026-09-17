import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // In development, log full error and component stack for fast root-cause identification
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary DEV] Caught error:', error);
      console.error('[ErrorBoundary DEV] Component stack:', errorInfo?.componentStack);
    } else {
      console.error('Unhandled UI exception captured by ErrorBoundary:', error.message);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
          <div className="max-w-md w-full bg-card border border-border/80 shadow-2xl rounded-2xl p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-9 h-9" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">حدث خطأ غير متوقع</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                واجه النظام مشكلة مؤقتة في معالجة هذه الصفحة. تم تأمين الجلسة لمنع فقدان البيانات.
              </p>
            </div>

            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="p-3 bg-muted/60 rounded-lg text-left text-xs font-mono text-muted-foreground overflow-x-auto max-h-32 text-destructive border border-border">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                onClick={this.handleReset}
                variant="default"
                className="w-full sm:w-auto gap-2 font-bold px-5"
              >
                <RefreshCw className="w-4 h-4" />
                إعادة المحاولة
              </Button>
              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="w-full sm:w-auto gap-2 font-semibold px-5"
              >
                <Home className="w-4 h-4" />
                الصفحة الرئيسية
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
