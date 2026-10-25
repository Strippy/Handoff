import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { initials, loadMyProfile } from '@/lib/marketplace';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ThemeToggle from '@/components/ThemeToggle';
import { ProPill } from '@/components/ProGate';
import { usePlan } from '@/lib/billing';
import { Bell, Bookmark, Compass, Crown, LogOut, MessageCircle, PlusCircle, Shield, User as UserIcon } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Browse', icon: Compass, end: true },
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const plan = usePlan();
  const location = useLocation();
  const nav = plan?.pro_enabled ? [...NAV, { to: '/pro', label: 'Pro' }] : NAV;
  const [profile, setProfile] = useState(null);
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    (async () => {
      const [p, notifs, msgs] = await Promise.all([
        loadMyProfile(user.id),
        base44.entities.Notification.count({ user_id: user.id, read: false }),
        base44.entities.Message.count({ recipient_id: user.id, read: false }),
      ]);
      if (!active) return;
      setProfile(p);
      setUnread(notifs || 0);
      setUnreadMessages(msgs || 0);
    })();
    return () => {
      active = false;
    };
  }, [user?.id, location.pathname]);

  const name = profile?.display_name || user?.full_name || 'Builder';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
          <Link to="/" className="mr-2 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-sm">
              H
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">Handoff</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button asChild size="sm" className="hidden rounded-full sm:inline-flex">
              <Link to="/sell">
                <PlusCircle className="mr-1.5 h-4 w-4" /> List a project
              </Link>
            </Button>
            <Link
              to="/notifications"
              className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </Link>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border border-border/70">
                    <AvatarImage src={profile?.avatar_url} alt={name} />
                    <AvatarFallback className="bg-secondary text-xs font-semibold">{initials(name)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                <div className="px-2 py-1.5">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    <span className="truncate">{name}</span>
                    {plan?.pro_enabled && plan?.is_pro && <ProPill />}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="rounded-xl">
                  <Link to="/profile">
                    <UserIcon className="mr-2 h-4 w-4" /> My builder page
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-xl">
                  <Link to="/welcome">
                    <PlusCircle className="mr-2 h-4 w-4" /> {profile ? 'Edit my profile' : 'Finish my profile'}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-xl">
                  <Link to="/deals">
                    <Shield className="mr-2 h-4 w-4" /> My deals
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="rounded-xl">
                  <Link to="/pro">
                    <Crown className="mr-2 h-4 w-4" /> Handoff Pro
                  </Link>
                </DropdownMenuItem>
                {user?.role === 'admin' && (
                  <DropdownMenuItem asChild className="rounded-xl">
                    <Link to="/admin">
                      <Shield className="mr-2 h-4 w-4" /> Moderation desk
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-xl" onClick={() => logout()}>
                  <LogOut className="mr-2 h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-16">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2 py-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-medium ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <Compass className="h-5 w-5" /> Browse
          </NavLink>
          <NavLink
            to="/saved"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-medium ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <Bookmark className="h-5 w-5" /> Saved
          </NavLink>
          <Link to="/sell" className="flex flex-col items-center gap-1 text-[11px] font-medium text-foreground">
            <span className="grid h-11 w-11 -translate-y-3 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <PlusCircle className="h-5 w-5" />
            </span>
            <span className="-mt-2">List</span>
          </Link>
          <NavLink
            to="/messages"
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-medium ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <MessageCircle className="h-5 w-5" /> Chats
            {unreadMessages > 0 && (
              <span className="absolute right-4 top-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-medium ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`
            }
          >
            <UserIcon className="h-5 w-5" /> Me
          </NavLink>
        </div>
      </nav>
    </div>
  );
}