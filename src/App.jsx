import { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import PageLoader from '@/components/PageLoader';
import lazyPage from '@/lib/lazyPage';

// Each page is its own file, loaded when first visited.
const Home = lazyPage(() => import('@/pages/Home'));
const ListingDetail = lazyPage(() => import('@/pages/ListingDetail'));
const ListingEditor = lazyPage(() => import('@/pages/ListingEditor'));
const Messages = lazyPage(() => import('@/pages/Messages'));
const Deals = lazyPage(() => import('@/pages/Deals'));
const DealRoom = lazyPage(() => import('@/pages/DealRoom'));
const Saved = lazyPage(() => import('@/pages/Saved'));
const Notifications = lazyPage(() => import('@/pages/Notifications'));
const Profile = lazyPage(() => import('@/pages/Profile'));
const Onboarding = lazyPage(() => import('@/pages/Onboarding'));
const Admin = lazyPage(() => import('@/pages/Admin'));
const GithubCallback = lazyPage(() => import('@/pages/GithubCallback'));
const GithubSetup = lazyPage(() => import('@/pages/GithubSetup'));
const Pro = lazyPage(() => import('@/pages/Pro'));
const Login = lazyPage(() => import('@/pages/Login'));
const Register = lazyPage(() => import('@/pages/Register'));
const ForgotPassword = lazyPage(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazyPage(() => import('@/pages/ResetPassword'));

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return <PageLoader />;
  }

  // Render the main app
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/sell" element={<ListingEditor />} />
            <Route path="/listing/:id" element={<ListingDetail />} />
            <Route path="/listing/:id/edit" element={<ListingEditor />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:id" element={<Messages />} />
            <Route path="/deals" element={<Deals />} />
            <Route path="/deals/:id" element={<DealRoom />} />
            <Route path="/saved" element={<Saved />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/builder/:id" element={<Profile />} />
            <Route path="/welcome" element={<Onboarding />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/github/callback" element={<GithubCallback />} />
            <Route path="/github/setup" element={<GithubSetup />} />
            <Route path="/pro" element={<Pro />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App