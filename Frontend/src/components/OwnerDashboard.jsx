import React, { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { IndianRupee, Receipt, Package, AlertTriangle, TrendingUp, Calendar, ShoppingBag } from 'lucide-react';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function OwnerDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        if (window.api?.getDashboardStats) {
          const data = await window.api.getDashboardStats();
          setStats(data);
        }
      } catch (e) {
        console.error("Dashboard fetch error:", e);
      }
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          Loading Dashboard...
        </div>
      </div>
    );
  }

  // Build daily chart data from real stats or show placeholder
  const dailySalesData = stats?.dailySales?.length > 0
    ? stats.dailySales.map(d => ({
        name: new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short' }),
        sales: d.total || 0,
        bills: d.bills || 0
      }))
    : dayNames.map(d => ({ name: d, sales: 0, bills: 0 }));

  // Monthly breakdown
  const monthlyData = stats?.monthlySalesBreakdown?.length > 0
    ? stats.monthlySalesBreakdown.map(m => ({
        name: m.month,
        total: m.total || 0,
        bills: m.bills || 0
      }))
    : [];

  const todaySales = stats?.todaySales || 0;
  const todayBills = stats?.todayBills || 0;
  const lowStockCount = stats?.lowStockCount || 0;
  const totalProducts = stats?.totalProducts || 0;
  const todayProfit = stats?.todayProfit || 0;
  const weeklyProfit = stats?.weeklyProfit || 0;
  const monthlyProfit = stats?.monthlyProfit || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-title" style={{ margin: 0 }}>Business Dashboard</div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
        <StatCard icon={<IndianRupee size={24} />} label="Today's Sales" value={"₹" + todaySales.toLocaleString('en-IN')} color="#0052cc" />
        <StatCard icon={<Receipt size={24} />} label="Today's Bills" value={todayBills} color="#8b5cf6" />
        <StatCard icon={<TrendingUp size={24} />} label="Today's Profit" value={"₹" + todayProfit.toLocaleString('en-IN')} color="#10b981" />
        <StatCard icon={<Package size={24} />} label="Total Products" value={totalProducts} color="#3b82f6" />
        <StatCard icon={<AlertTriangle size={24} />} label="Low Stock" value={lowStockCount} color="#f59e0b" alert={lowStockCount > 0} />
      </div>

      {/* Profit Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        <div className="modern-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today's Profit</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: todayProfit >= 0 ? '#10b981' : 'var(--danger)' }}>₹{todayProfit.toLocaleString('en-IN')}</div>
        </div>
        <div className="modern-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weekly Profit</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: weeklyProfit >= 0 ? '#10b981' : 'var(--danger)' }}>₹{weeklyProfit.toLocaleString('en-IN')}</div>
        </div>
        <div className="modern-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Profit</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: monthlyProfit >= 0 ? '#10b981' : 'var(--danger)' }}>₹{monthlyProfit.toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Sales Trend Chart */}
        <div className="modern-card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="var(--text-3)" />
            7-Day Sales Trend
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-3)', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-3)', fontSize: 12}} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: 'var(--shadow-md)' }} />
                <Area type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Products */}
        <div className="modern-card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={18} color="var(--text-3)" />
            Top Selling (30d)
          </div>
          {stats?.topProducts?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stats.topProducts.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < stats.topProducts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>{i+1}</div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 13 }}>{p.sold} sold</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-4)' }}>No sales data yet</div>
          )}
        </div>
      </div>

      {/* Monthly Breakdown */}
      {monthlyData.length > 0 && (
        <div className="modern-card">
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={18} color="var(--text-3)" />
            Monthly Sales Breakdown
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-3)', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-3)', fontSize: 12}} />
                <Tooltip cursor={{fill: 'var(--surface-2)'}} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: 'var(--shadow-md)' }} />
                <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, alert }) {
  return (
    <div className="modern-card" style={{ padding: 20, position: 'relative' }}>
      {alert && (
        <div style={{ position: 'absolute', top: 16, right: 16, width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 0 4px var(--danger-bg)' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `${color}15`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
        </div>
      </div>
    </div>
  );
}
