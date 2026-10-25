import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { asItems, timeAgo } from '@/lib/marketplace';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EmptyState from '@/components/EmptyState';
import StagePill from '@/components/StagePill';
import GithubAdminCard from '@/components/GithubAdminCard';
import BillingAdminCard from '@/components/BillingAdminCard';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Shield, ShieldAlert } from 'lucide-react';

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [reportFilter, setReportFilter] = useState('open');
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({ builders: 0, listings: 0, deals: 0, reviews: 0 });
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role === 'admin';

  const load = async () => {
    setLoading(true);
    const reportQuery = reportFilter === 'all' ? { reason: { $exists: true } } : { status: reportFilter };
    const [reportRes, listingRes, builders, listingCount, deals, reviews] = await Promise.all([
      api.entities.Report.filter(reportQuery, { sort: '-created_date', limit: 100 }),
      api.entities.Listing.filter({ status: { $exists: true } }, { sort: '-created_date', limit: 50 }),
      api.entities.BuilderProfile.count({ user_id: { $exists: true } }),
      api.entities.Listing.count({ status: 'active' }),
      api.entities.Deal.count({ status: { $exists: true } }),
      api.entities.Review.count({ rating: { $exists: true } }),
    ]);
    setReports(asItems(reportRes));
    setListings(asItems(listingRes));
    setStats({
      builders: builders || 0,
      listings: listingCount || 0,
      deals: deals || 0,
      reviews: reviews || 0,
    });
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    load();
  }, [isAdmin, reportFilter]);

  const updateReport = async (report, status) => {
    setBusy(true);
    await api.entities.Report.update(report.id, { status });
    setReports(reports.map((item) => (item.id === report.id ? { ...item, status } : item)));
    setBusy(false);
  };

  const archiveTarget = async (report) => {
    setBusy(true);
    if (report.target_type === 'listing') {
      await api.entities.Listing.update(report.target_id, { status: 'archived' });
    }
    await api.entities.Report.update(report.id, { status: 'actioned' });
    setReports(reports.map((item) => (item.id === report.id ? { ...item, status: 'actioned' } : item)));
    setBusy(false);
    toast({ title: 'Actioned', description: 'The listing is off the market.' });
  };

  const setListingStatus = async (listing, status) => {
    setBusy(true);
    await api.entities.Listing.update(listing.id, { status });
    setListings(listings.map((item) => (item.id === listing.id ? { ...item, status } : item)));
    setBusy(false);
  };

  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Moderators only"
        body="This desk belongs to the app admins."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <Shield className="h-6 w-6 text-primary" /> Moderation desk
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reports, listings and the numbers behind them. Keeping this room friendly is the whole job.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'builders', value: stats.builders },
          { label: 'live listings', value: stats.listings },
          { label: 'deals', value: stats.deals },
          { label: 'reviews', value: stats.reviews },
        ].map((stat) => (
          <div key={stat.label} className="card-soft p-4">
            <p className="font-display text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <BillingAdminCard />
      <GithubAdminCard />

      <Tabs defaultValue="reports">
        <TabsList className="rounded-full">
          <TabsTrigger value="reports" className="rounded-full">
            Reports {reports.length > 0 && `(${reports.length})`}
          </TabsTrigger>
          <TabsTrigger value="listings" className="rounded-full">
            Listings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Select value={reportFilter} onValueChange={setReportFilter}>
              <SelectTrigger className="h-9 w-44 rounded-full bg-card text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open reports</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
                <SelectItem value="actioned">Actioned</SelectItem>
                <SelectItem value="all">Everything</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {reports.length === 0 ? (
            <EmptyState icon={Shield} title="Nothing to review" body="No reports in this bucket. Quiet is good." />
          ) : (
            <ul className="space-y-3">
              {reports.map((report) => (
                <li key={report.id} className="card-soft space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip">{report.reason}</span>
                    <span className="text-xs text-muted-foreground">
                      {report.target_type} · {timeAgo(report.created_date)} · by {report.reporter_name || 'someone'}
                    </span>
                    <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {report.status}
                    </span>
                  </div>
                  <p className="font-display text-sm font-semibold">{report.target_label}</p>
                  {report.details && <p className="text-sm text-muted-foreground">{report.details}</p>}
                  <div className="flex flex-wrap gap-2">
                    {report.target_type === 'listing' && (
                      <Button asChild variant="outline" size="sm" className="rounded-full">
                        <Link to={`/listing/${report.target_id}`} target="_blank">
                          View listing
                        </Link>
                      </Button>
                    )}
                    {report.target_type === 'deal' && (
                      <Button asChild variant="outline" size="sm" className="rounded-full">
                        <Link to={`/deals/${report.target_id}`} target="_blank">
                          Open the deal record
                        </Link>
                      </Button>
                    )}
                    {report.target_type === 'builder' && (
                      <Button asChild variant="outline" size="sm" className="rounded-full">
                        <Link to={`/builder/${report.target_id}`} target="_blank">
                          View builder
                        </Link>
                      </Button>
                    )}
                    {report.status === 'open' && (
                      <>
                        <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => updateReport(report, 'dismissed')}>
                          Dismiss
                        </Button>
                        <Button size="sm" className="rounded-full" disabled={busy} onClick={() => archiveTarget(report)}>
                          {report.target_type === 'listing' ? 'Take listing down' : 'Mark actioned'}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="listings" className="mt-6">
          {listings.length === 0 ? (
            <EmptyState icon={Shield} title="No listings yet" body="Nothing has been listed on the marketplace yet." />
          ) : (
            <ul className="space-y-3">
              {listings.map((listing) => (
                <li key={listing.id} className="card-soft flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Link to={`/listing/${listing.id}`} className="font-display text-sm font-semibold hover:text-primary">
                      {listing.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {listing.seller_name} · {timeAgo(listing.created_date)} · {listing.status}
                    </p>
                  </div>
                  <StagePill stage={listing.stage} />
                  {listing.status === 'archived' ? (
                    <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => setListingStatus(listing, 'active')}>
                      Restore
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => setListingStatus(listing, 'archived')}>
                      Archive
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}