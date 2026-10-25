import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';

export default function PageNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="font-display text-7xl font-light text-muted-foreground/50">404</h1>
          <div className="mx-auto h-0.5 w-16 bg-border" />
        </div>
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">Page not found</h2>
          <p className="text-muted-foreground">That page doesn’t exist, or it has moved.</p>
        </div>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" /> Back to Handoff
          </Link>
        </Button>
      </div>
    </div>
  );
}
