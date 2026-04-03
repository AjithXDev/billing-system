import React, { useState, useEffect, useRef } from "react";

/* ─── helpers ──────────────────────────────────────────────── */
const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().split("T")[0];

function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date(today())) / 86400000);
}

/* ─── Stat Card ─────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color = "#3b82f6", alert }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${alert ? "#f97316" : "var(--border)"}`,
      borderRadius: 14,
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      position: "relative",
      overflow: "hidden",
      boxShadow: alert ? "0 0 0 2px #f9731630" : "var(--shadow-sm)"
    }}>
      {alert && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "#f97316", color: "#fff",
          borderRadius: 20, fontSize: 9, fontWeight: 700,
          padding: "2px 7px", letterSpacing: ".05em"
        }}>ALERT</div>
      )}
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${color}18`, display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: 18
      }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-4)" }}>{sub}</div>}
    </div>
  );
}

/* ─── AI Chat Bubble ────────────────────────────────────────── */
function ChatBubble({ message, type = "bot", timestamp }) {
  const isBot = type === "bot";
  const isAlert = type === "alert";
  return (
    <div style={{
      display: "flex",
      flexDirection: isBot || isAlert ? "row" : "row-reverse",
      gap: 10,
      marginBottom: 12,
      alignItems: "flex-end"
    }}>
      {(isBot || isAlert) && (
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: isAlert ? "linear-gradient(135deg,#f97316,#ef4444)" : "linear-gradient(135deg,#3b82f6,#7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, flexShrink: 0
        }}>
          {isAlert ? "🔔" : "🤖"}
        </div>
      )}
      <div style={{
        maxWidth: "78%",
        background: isAlert
          ? "linear-gradient(135deg,#fff7ed,#fef3c7)"
          : isBot
          ? "var(--surface)"
          : "linear-gradient(135deg,#2563eb,#7c3aed)",
        border: isAlert ? "1px solid #fdba74" : isBot ? "1px solid var(--border)" : "none",
        borderRadius: isBot || isAlert ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
        padding: "10px 14px",
        fontSize: 13,
        color: !isBot && !isAlert ? "#fff" : "var(--text-1)",
        lineHeight: 1.5,
        boxShadow: "var(--shadow-xs)"
      }}>
        <div dangerouslySetInnerHTML={{ __html: message }} />
        {timestamp && (
          <div style={{ fontSize: 10, color: isBot || isAlert ? "var(--text-4)" : "rgba(255,255,255,.6)", marginTop: 4 }}>
            {timestamp}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Near Expiry Badge ─────────────────────────────────────── */
function ExpiryBadge({ days }) {
  if (days === null) return null;
  const clr = days < 0 ? "#ef4444" : days <= 3 ? "#f97316" : "#eab308";
  const lbl = days < 0 ? "EXPIRED" : days === 0 ? "Today!" : `${days}d left`;
  return (
    <span style={{
      background: `${clr}20`, color: clr,
      border: `1px solid ${clr}50`,
      borderRadius: 20, fontSize: 10, fontWeight: 700,
      padding: "2px 7px"
    }}>{lbl}</span>
  );
}

/* ─── Section Header ─────────────────────────────────────────── */
function SectionHead({ title, icon, count, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      marginBottom: 12, paddingBottom: 10,
      borderBottom: "1px solid var(--border)"
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontWeight: 700, color: "var(--text-1)", fontSize: 14 }}>{title}</span>
      {count !== undefined && (
        <span style={{
          background: `${color}20`, color,
          border: `1px solid ${color}40`,
          borderRadius: 20, fontSize: 10.5, fontWeight: 700,
          padding: "2px 8px", marginLeft: "auto"
        }}>{count} items</span>
      )}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function OwnerDashboard() {
  const [stats, setStats] = useState(null);
  const [expiry, setExpiry] = useState({ expired: [], nearExpiry: [] });
  const [stock, setStock] = useState({ lowStock: [], deadStock: [] });
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const chatEndRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, e, st] = await Promise.all([
        window.api?.getDashboardStats?.() || {},
        window.api?.getExpiryAlerts?.()   || { expired: [], nearExpiry: [] },
        window.api?.getStockAlerts?.()    || { lowStock: [], deadStock: [] }
      ]);
      setStats(s);
      setExpiry(e);
      setStock(st);

      // Build smart AI alerts
      const alerts = [];
      const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

      if ((e.expired || []).length > 0) {
        alerts.push({
          type: "alert",
          message: `🚫 <b>${e.expired.length} product(s) EXPIRED!</b> Block these from billing immediately: <br/>${e.expired.map(p => `• ${p.name} (expired ${p.expiry_date})`).join("<br/>")}`,
          timestamp: now
        });
      }
      if ((e.nearExpiry || []).length > 0) {
        alerts.push({
          type: "alert",
          message: `⚠️ <b>${e.nearExpiry.length} product(s)</b> expiring within 7 days:<br/>${e.nearExpiry.map(p => `• ${p.name} — expires <b>${p.expiry_date}</b>`).join("<br/>")}`,
          timestamp: now
        });
      }
      if ((st.lowStock || []).length > 0) {
        alerts.push({
          type: "alert",
          message: `📦 <b>Low Stock Alert!</b> ${st.lowStock.length} item(s) running low:<br/>${st.lowStock.slice(0, 5).map(p => `• ${p.name}: only <b>${p.quantity} ${p.unit || "units"}</b> left`).join("<br/>")}`,
          timestamp: now
        });
      }
      if ((st.deadStock || []).length > 0) {
        alerts.push({
          type: "alert",
          message: `💀 <b>Dead Stock Detected!</b> ${st.deadStock.length} product(s) haven't sold in 30 days. Consider offers or return to supplier.`,
          timestamp: now
        });
      }

      const greeting = {
        type: "bot",
        message: `👋 <b>Good ${greeting_time()}!</b> Here's your store summary for today:<br/>
          💰 Today's Sales: <b>${fmt(s.todaySales)}</b><br/>
          🧾 Bills Today: <b>${s.todayBills}</b><br/>
          📦 Total Products: <b>${s.totalProducts}</b>`,
        timestamp: now
      };
      setMessages([greeting, ...alerts]);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const greeting_time = () => {
    const h = new Date().getHours();
    return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const q = chatInput.trim().toLowerCase();
    const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const userMsg = { type: "user", message: chatInput, timestamp: now };

    let reply = "";
    if (q.includes("low stock") || q.includes("stock")) {
      reply = stock.lowStock.length > 0
        ? `📦 <b>${stock.lowStock.length} low-stock items:</b><br/>${stock.lowStock.map(p => `• ${p.name}: <b>${p.quantity}</b> left`).join("<br/>")}`
        : "✅ All products are well-stocked!";
    } else if (q.includes("dead stock") || q.includes("dead")) {
      reply = stock.deadStock.length > 0
        ? `💀 <b>${stock.deadStock.length} dead-stock items</b> (no sales in 30 days):<br/>${stock.deadStock.slice(0, 7).map(p => `• ${p.name}: ${p.quantity} units sitting idle`).join("<br/>")}`
        : "✅ No dead stock detected! Great turnover.";
    } else if (q.includes("expir")) {
      const all = [...(expiry.expired || []), ...(expiry.nearExpiry || [])];
      reply = all.length > 0
        ? `🗓️ <b>${expiry.expired.length} expired, ${expiry.nearExpiry.length} near-expiry:</b><br/>${all.map(p => `• ${p.name} — <b>${p.expiry_date}</b>`).join("<br/>")}`
        : "✅ No expiry concerns right now!";
    } else if (q.includes("sale") || q.includes("revenue") || q.includes("today")) {
      reply = `💰 Today's Revenue: <b>${fmt(stats?.todaySales)}</b> from <b>${stats?.todayBills}</b> bills.`;
    } else if (q.includes("top") || q.includes("best")) {
      reply = stats?.topProducts?.length > 0
        ? `🏆 <b>Top products this month:</b><br/>${stats.topProducts.map((p, i) => `${i + 1}. ${p.name} — <b>${p.sold} sold</b>`).join("<br/>")}`
        : "Not enough sales data yet.";
    } else if (q.includes("out of stock")) {
      reply = `🚫 <b>${stats?.outOfStock || 0} products</b> are currently out of stock.`;
    } else {
      reply = `I can help you with:<br/>
        • <i>"low stock"</i> — items running low<br/>
        • <i>"dead stock"</i> — items not selling<br/>
        • <i>"expiry"</i> — near/expired products<br/>
        • <i>"today sales"</i> — revenue summary<br/>
        • <i>"top products"</i> — best sellers`;
    }

    setMessages(prev => [...prev, userMsg, { type: "bot", message: reply, timestamp: now }]);
    setChatInput("");
  };

  const TABS = [
    { id: "dashboard", label: "📊 Overview" },
    { id: "expiry",    label: "🗓️ Expiry" },
    { id: "stock",     label: "📦 Stock" },
    { id: "chat",      label: "💬 AI Alerts" },
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-3)", fontSize: 15 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12, animation: "spin 1s linear infinite" }}>⚙️</div>
        <div>Loading dashboard...</div>
      </div>
    </div>
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* TAB BAR */}
      <div style={{
        display: "flex", gap: 4, padding: "8px 0 0",
        borderBottom: "1px solid var(--border)", flexShrink: 0
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "7px 16px", borderRadius: "8px 8px 0 0",
            border: "1px solid var(--border)",
            borderBottom: activeTab === t.id ? "2px solid var(--primary)" : "1px solid transparent",
            background: activeTab === t.id ? "var(--surface)" : "transparent",
            color: activeTab === t.id ? "var(--primary)" : "var(--text-3)",
            fontWeight: activeTab === t.id ? 700 : 500,
            fontSize: 12.5, cursor: "pointer"
          }}>{t.label}</button>
        ))}
        <button onClick={load} style={{
          marginLeft: "auto", padding: "5px 12px",
          border: "1px solid var(--border)", borderRadius: 8,
          background: "transparent", color: "var(--text-3)",
          fontSize: 12, cursor: "pointer"
        }}>🔄 Refresh</button>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 0" }}>

        {/* ── OVERVIEW ─────────── */}
        {activeTab === "dashboard" && (
          <div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12, marginBottom: 20
            }}>
              <StatCard icon="💰" label="Today's Sales"   value={fmt(stats?.todaySales)}   color="#16a34a" />
              <StatCard icon="🧾" label="Bills Today"     value={stats?.todayBills || 0}   color="#3b82f6" />
              <StatCard icon="📦" label="Total Products"  value={stats?.totalProducts || 0} color="#7c3aed" />
              <StatCard icon="🚫" label="Expired Items"   value={stats?.expiredCount || 0}  color="#ef4444" alert={stats?.expiredCount > 0} />
              <StatCard icon="⚠️" label="Near Expiry"    value={stats?.nearExpiryCount || 0} color="#f97316" alert={stats?.nearExpiryCount > 0} />
              <StatCard icon="📉" label="Low Stock"       value={stats?.lowStockCount || 0} color="#eab308" alert={stats?.lowStockCount > 0} />
              <StatCard icon="❌" label="Out of Stock"    value={stats?.outOfStock || 0}   color="#ef4444" alert={stats?.outOfStock > 0} />
            </div>

            {/* Top Products */}
            {stats?.topProducts?.length > 0 && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <SectionHead title="Top Sellers This Month" icon="🏆" color="#eab308" count={stats.topProducts.length} />
                {stats.topProducts.map((p, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                    borderBottom: i < stats.topProducts.length - 1 ? "1px solid var(--border)" : "none"
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: i === 0 ? "#f59e0b20" : "var(--surface-2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800, color: i === 0 ? "#f59e0b" : "var(--text-3)"
                    }}>{i + 1}</div>
                    <div style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: "var(--text-1)" }}>{p.name}</div>
                    <div style={{
                      background: "#3b82f620", color: "#3b82f6",
                      borderRadius: 20, fontSize: 12, fontWeight: 700,
                      padding: "2px 10px"
                    }}>{p.sold} sold</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EXPIRY ───────────── */}
        {activeTab === "expiry" && (
          <div>
            {/* Expired Products */}
            <div style={{ background: "var(--surface)", border: "1px solid #ef4444", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <SectionHead title="Expired Products — Billing BLOCKED ❌" icon="🚫" color="#ef4444" count={expiry.expired?.length} />
              {expiry.expired?.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-4)", padding: "20px 0" }}>✅ No expired products!</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#ef444410" }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#ef4444" }}>Product</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#ef4444" }}>Expiry</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#ef4444" }}>Stock</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#ef4444" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiry.expired.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)", background: "#ef444408" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-1)" }}>{p.name}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#ef4444", fontWeight: 700 }}>{p.expiry_date}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--text-2)" }}>{p.quantity} {p.unit}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}><ExpiryBadge days={daysUntilExpiry(p.expiry_date)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Near Expiry */}
            <div style={{ background: "var(--surface)", border: "1px solid #f97316", borderRadius: 14, padding: 20 }}>
              <SectionHead title="Near Expiry — Alert (within 7 days) ⚠️" icon="⚠️" color="#f97316" count={expiry.nearExpiry?.length} />
              {expiry.nearExpiry?.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-4)", padding: "20px 0" }}>✅ Nothing expiring soon!</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9731610" }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#f97316" }}>Product</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#f97316" }}>Expiry Date</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#f97316" }}>Stock</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#f97316" }}>Days Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiry.nearExpiry.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-1)" }}>{p.name}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "var(--text-2)" }}>{p.expiry_date}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--text-2)" }}>{p.quantity} {p.unit}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}><ExpiryBadge days={daysUntilExpiry(p.expiry_date)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── STOCK ALERTS ──────── */}
        {activeTab === "stock" && (
          <div>
            {/* Low Stock */}
            <div style={{ background: "var(--surface)", border: "1px solid #eab308", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <SectionHead title="Low Stock Items (≤ 5 units)" icon="📉" color="#eab308" count={stock.lowStock?.length} />
              {stock.lowStock?.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-4)", padding: "20px 0" }}>✅ All products have sufficient stock!</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                  {stock.lowStock.map(p => (
                    <div key={p.id} style={{
                      background: "#fef9c3", border: "1px solid #fde047",
                      borderRadius: 10, padding: "12px 14px"
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#713f12", marginBottom: 4 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#a16207", marginBottom: 6 }}>{p.category_name}</div>
                      <div style={{
                        fontSize: 20, fontWeight: 800, color: "#dc2626"
                      }}>{p.quantity} <span style={{ fontSize: 12, fontWeight: 500 }}>{p.unit}</span></div>
                      <div style={{ fontSize: 10, color: "#a16207", marginTop: 2 }}>⚠️ Restock urgently!</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dead Stock */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
              <SectionHead title="Dead Stock (Not Sold in 30 Days)" icon="💀" color="#64748b" count={stock.deadStock?.length} />
              {stock.deadStock?.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-4)", padding: "20px 0" }}>✅ No dead stock! Products are moving well.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "var(--text-3)" }}>Product</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "var(--text-3)" }}>Category</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Stock</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "var(--text-3)" }}>Value (Cost)</th>
                      <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>Suggestion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.deadStock.map(p => (
                      <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-1)" }}>{p.name}</td>
                        <td style={{ padding: "10px 12px", color: "var(--text-3)", fontSize: 12 }}>{p.category_name}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--text-2)" }}>{p.quantity} {p.unit}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#64748b" }}>
                          {fmt((p.cost_price || 0) * p.quantity)}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{
                            background: "#f1f5f920", color: "#64748b",
                            border: "1px solid #e2e8f0",
                            borderRadius: 20, fontSize: 10.5, fontWeight: 600,
                            padding: "2px 8px"
                          }}>Run Offer / Return</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── AI CHAT ───────────── */}
        {activeTab === "chat" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{
              flex: 1, overflowY: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14, padding: 16,
              minHeight: 300, maxHeight: 420
            }}>
              {messages.map((m, i) => (
                <ChatBubble key={i} message={m.message} type={m.type} timestamp={m.timestamp} />
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleChat} style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask: low stock / expiry / today sales / top products / dead stock..."
                style={{
                  flex: 1, height: 40, borderRadius: 10,
                  border: "1px solid var(--border-2)",
                  background: "var(--surface)",
                  padding: "0 14px", fontSize: 13,
                  color: "var(--text-1)", outline: "none"
                }}
              />
              <button type="submit" style={{
                height: 40, padding: "0 18px",
                background: "var(--primary)", color: "#fff",
                border: "none", borderRadius: 10,
                fontWeight: 700, cursor: "pointer", fontSize: 13
              }}>Send 🚀</button>
            </form>
            <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 6, textAlign: "center" }}>
              Try: "low stock" · "dead stock" · "expiry" · "today sales" · "top products"
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
