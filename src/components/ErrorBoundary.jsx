import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

// Catches a crash anywhere below it and shows a way back, instead of a blank page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[app] crashed', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-5 text-center">
          <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">
            This page hit an error. Reloading usually fixes it. If it keeps happening, let us know what you were doing.
          </p>
          <Button className="rounded-full" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Reload
          </Button>
        </div>
      </div>
    );
  }
}
