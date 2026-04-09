import React, { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";

export default function Chatbot() {
  const [messages, setMessages] = useState([
    { sender: "bot", text: "Hello! I am your AI assistant. You can ask me about stock availability, expiry dates, sales data, profit, or how to use the system." }
  ]);
  const [input, setInput] = useState("");
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Fetch system data to use for answering queries
    if (window.api?.getProductsFull) {
      window.api.getProductsFull().then(data => setProducts(data || []));
    }
    if (window.api?.getDashboardStats) {
      window.api.getDashboardStats().then(data => setStats(data));
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setMessages(prev => [...prev, { sender: "user", text: userMessage }]);
    setInput("");

    // Simulate thinking delay
    setTimeout(() => {
      const response = generateResponse(userMessage);
      setMessages(prev => [...prev, { sender: "bot", text: response }]);
    }, 500);
  };

  const generateResponse = (originalQuery) => {
    const q = originalQuery.toLowerCase();

    // 1. System Usage Help
    if (q.includes("how do i add") || q.includes("how to add")) {
      if (q.includes("product")) return "You can add a product by going to 'Register Product' in the left menu. Fill in the name, price, stock, and upload an image, then click 'Save Product'.";
      if (q.includes("bill") || q.includes("invoice") || q.includes("sale")) return "To make a bill, go to 'Billing Terminal'. Click on products to add them to your cart, or search them. Then click 'Checkout', choose a payment method, and complete the bill.";
      return "To add data, navigate to the specific section in the left menu (like 'Register Product' or 'Billing Terminal').";
    }

    // 2. Profit Queries
    if (q.includes("profit")) {
      if (q.includes("today")) return `You made a profit of ₹${stats?.todayProfit?.toLocaleString('en-IN') || 0} today.`;
      if (q.includes("week")) return `Your profit for the last 7 days is ₹${stats?.weeklyProfit?.toLocaleString('en-IN') || 0}.`;
      if (q.includes("month")) return `Your profit for the last 30 days is ₹${stats?.monthlyProfit?.toLocaleString('en-IN') || 0}.`;
      return `Total profit today is ₹${stats?.todayProfit?.toLocaleString('en-IN') || 0}. You can also ask for weekly or monthly profit.`;
    }

    // 3. Billing & Sales Queries
    if (q.includes("sale") || q.includes("sold") || q.includes("invoice") || q.includes("bill")) {
      if (q.includes("today")) {
        const sales = stats?.todaySales || 0;
        const bills = stats?.todayBills || 0;
        return `Today's total sales match ₹${sales.toLocaleString('en-IN')} across ${bills} bills.`;
      }
      if (q.includes("week") || q.includes("last week") || q.includes("7 days")) {
        return `Over the last 7 days, total sales were ₹${stats?.weeklySales?.toLocaleString('en-IN') || 0}.`;
      }
      if (q.includes("month") || q.includes("30 days")) {
        return `Over the last 30 days, total sales were ₹${stats?.monthlySales?.toLocaleString('en-IN') || 0}.`;
      }
      
      // If specifying a product e.g., "How many oil products were sold..."
      const matchedProduct = products.find(p => q.includes(p.name.toLowerCase()));
      if (matchedProduct) {
        const soldStat = stats?.topProducts?.find(tp => tp.name === matchedProduct.name);
        if (soldStat) return `${matchedProduct.name} has sold ${soldStat.sold} units over the last 30 days.`;
        return `I don't see recent major sales data specifically for ${matchedProduct.name}.`;
      }

      return `Total sales today is ₹${stats?.todaySales?.toLocaleString('en-IN') || 0}. You can also ask about sales for the week or month.`;
    }

    // 4. Expiry Date Queries
    if (q.includes("expire") || q.includes("expiry")) {
      const matchedProduct = products.find(p => q.includes(p.name.toLowerCase()));
      if (matchedProduct) {
        return matchedProduct.expiry_date 
          ? `The expiry date for ${matchedProduct.name} is ${new Date(matchedProduct.expiry_date).toLocaleDateString()}.` 
          : `${matchedProduct.name} does not have an expiry date recorded.`;
      }
      if (q.includes("alert") || q.includes("near")) {
        const nearCount = stats?.nearExpiryCount || 0;
        const expCount = stats?.expiredCount || 0;
        return `You have ${expCount} expired products and ${nearCount} products nearing expiry in the next 7 days.`;
      }
      return "Please specify the exact product name, e.g., 'What is the expiry date of milk?'";
    }

    // 5. Stock & Inventory Queries
    if (q.includes("stock") || q.includes("available") || q.includes("how many")) {
      // General overall requests
      if (q.includes("all products") || (q.includes("how many products") && !q.includes("sold"))) {
        return `You currently have ${products.length} total products registered in the inventory.`;
      }
      if (q.includes("low stock")) {
        const low = stats?.lowStockCount || 0;
        return `You currently have ${low} items running low in stock (5 or fewer left).`;
      }

      // Specific product
      const matchedProduct = products.find(p => q.includes(p.name.toLowerCase()));
      if (matchedProduct) {
        return `We currently have ${matchedProduct.quantity} ${matchedProduct.unit || 'units'} of ${matchedProduct.name} in stock.`;
      }

      return "Which product's stock are you asking about? Try 'How much stock is available for oil?'";
    }

    // 6. Generic Analytics / Dashboard
    if (q.includes("dashboard") || q.includes("overview")) {
      return `Quick Overview: Today's Sales = ₹${stats?.todaySales || 0}, Profit = ₹${stats?.todayProfit || 0}. Total products = ${products.length}. Low stock items = ${stats?.lowStockCount || 0}.`;
    }

    // Default fallback
    return "I'm not exactly sure about that. Try asking:\n- 'What is today's total sales?'\n- 'How much profit did I make today?'\n- 'How many products are in stock?'\n- 'What is the expiry date of oil?'";
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      <div className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Sparkles size={24} color="var(--primary)" />
        AI Store Assistant
      </div>

      <div className="modern-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        
        {/* Chat History Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--surface-2)' }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
              flexDirection: m.sender === 'user' ? 'row-reverse' : 'row',
              maxWidth: '80%'
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: m.sender === 'user' ? 'var(--primary)' : 'var(--surface)',
                color: m.sender === 'user' ? '#fff' : 'var(--primary)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                {m.sender === 'user' ? <User size={20} /> : <Bot size={20} />}
              </div>
              
              <div style={{
                background: m.sender === 'user' ? 'var(--primary)' : 'var(--surface)',
                color: m.sender === 'user' ? '#fff' : 'var(--text-1)',
                padding: '12px 16px',
                borderRadius: m.sender === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                fontSize: 14,
                lineHeight: 1.5,
                boxShadow: 'var(--shadow-sm)',
                border: m.sender === 'bot' ? '1px solid var(--border)' : 'none',
                whiteSpace: 'pre-wrap'
              }}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={{ padding: '16px 24px', background: 'var(--surface)', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              type="text"
              className="form-input"
              style={{ flex: 1, borderRadius: 24, height: 48, padding: '0 20px' }}
              placeholder="Ask about stock, expiry, or sales... (e.g. 'What is the expiry date of oil?')"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              autoFocus
            />
            <button
              onClick={handleSend}
              style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--primary)', color: '#fff',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 82, 204, 0.25)',
                transition: 'transform 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Send size={20} style={{ marginLeft: 2 }} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
