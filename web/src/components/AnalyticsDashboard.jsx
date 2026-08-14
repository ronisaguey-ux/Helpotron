import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

const Card = ({ className = '', children }) => (
  <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
);

const Stat = ({ label, value, sub = '' }) => (
  <div>
    <div className="text-xs text-slate-500">{label}</div>
    <div className="text-2xl font-bold text-slate-900">{value}</div>
    {sub && <div className="text-xs text-slate-400">{sub}</div>}
  </div>
);

export default function AnalyticsDashboard({ userId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [activity, setActivity] = useState([]);
  const [valueMetrics, setValueMetrics] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const [a, act, vm] = await Promise.all([
          api.get(`/api/analytics?public_id=${userId}`),
          api.get(`/api/analytics/activity?public_id=${userId}&days=30`),
          api.get(`/api/analytics/value?public_id=${userId}`),
        ]);
        setAnalytics(a);
        setActivity(act || []);
        setValueMetrics(vm);
      } catch (e) {
        setError(e.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [userId]);

  if (loading) return <Card>Loading analytics…</Card>;
  if (error) return <Card className="text-red-600">{error}</Card>;
  if (!analytics) return <Card>No analytics data yet. Start studying to see insights!</Card>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Study Time" value={`${analytics.total_study_time_hours || 0}h`} />
        <Stat label="Materials Studied" value={analytics.materials_studied || 0} />
        <Stat label="Avg Score" value={analytics.average_score ? `${Math.round(analytics.average_score)}%` : '—'} />
        <Stat label="Sessions" value={analytics.session_count || 0} />
      </div>

      {valueMetrics && (
        <Card>
          <h3 className="font-semibold mb-2">💰 Your ROI</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-slate-500">Study hours:</span> {valueMetrics.study_hours || 0}h</div>
            <div><span className="text-slate-500">Monthly cost:</span> ${valueMetrics.monthly_cost || 0}</div>
            <div><span className="text-slate-500">Cost per hour:</span> ${valueMetrics.cost_per_hour || '—'}</div>
            <div><span className="text-slate-500">Tutor savings:</span> ${valueMetrics.tutor_savings ? Math.round(valueMetrics.tutor_savings) : '—'}</div>
          </div>
        </Card>
      )}

      {activity && activity.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3">📊 Activity (last 30 days)</h3>
          <div className="space-y-2">
            {activity.slice(0, 7).map((day) => (
              <div key={day.date} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-slate-500">{day.date}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-700 rounded-full"
                    style={{ width: `${Math.min(100, day.time_minutes / 10 * 100)}%` }}
                  />
                </div>
                <span className="w-16 text-right text-slate-600">{day.time_minutes}m</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {analytics.material_breakdown && Object.keys(analytics.material_breakdown).length > 0 && (
        <Card>
          <h3 className="font-semibold mb-2">📚 Material breakdown</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analytics.material_breakdown).map(([kind, count]) => (
              <span key={kind} className="px-2 py-1 bg-slate-100 rounded text-sm">
                {kind}: {count}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
