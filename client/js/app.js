/* Mr. Tucker's DMS (front-end prototype)
   - Vanilla JS, no build step
   - localStorage persistence + export/backup
   - Multi-page (each page includes this same script)
*/

const STORAGE_KEY = "mt_dms_v2";

const DEFAULT_DISCOUNT_RULE = {
  thresholdUSD: 50000,
  perkText: "Eligible for the monthly car wash discount (purchase over $50k)."
};

const $ = (sel) => document.querySelector(sel);

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function formatUSD(amount) {
  const num = Number(amount || 0);
  return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2400);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s) { return escapeHtml(s); }

// API call to the server, allows data submitted on the website to also be saved into the prisma database
const API = "http://localhost:3000/api";

async function apiPost(endpoint, data) {
  try {
    const res = await fetch(`${API}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }
    return await res.json();
  } catch (err) {
    console.error("API error:", err.message);
    throw err;
  }
}

async function apiDelete(endpoint) {
  try {
    const res = await fetch(`${API}/${endpoint}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Server error");
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.error("API error:", err.message);
    throw err;
  }
}

/* ---- State ---- */

let state = loadState();

function loadState() {
  const parsed = safeJsonParse(localStorage.getItem(STORAGE_KEY));
  if (!parsed || typeof parsed !== "object") {
    return {
      session: null,
      vehicles: [],
      customers: [],
      transactions: [],
      invoices: {},
      settings: { discountRule: { ...DEFAULT_DISCOUNT_RULE } },
      employees: [],
      driverLicenses: [],
      creditCards: []
    };
  }
  return {
    session: parsed.session ?? null,
    vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    invoices: parsed.invoices ?? {},
    settings: parsed.settings ?? { discountRule: { ...DEFAULT_DISCOUNT_RULE } },
    employees: Array.isArray(parsed.employees) ? parsed.employees : [],
    driverLicenses: Array.isArray(parsed.driverLicenses) ? parsed.driverLicenses : [],
    creditCards: Array.isArray(parsed.creditCards) ? parsed.creditCards : []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---- Auth (demo) ---- */

function login(username, password, role) {
  if (password !== "demo") return false;
  state.session = { username, role };
  saveState();
  return true;
}

function logout() {
  state.session = null;
  saveState();
  window.location.href = "login.html";
}

function requireAuth() {
  if (!state.session) window.location.href = "login.html";
}

const MOCK_EMPLOYEES = [
  { name: "Ted Mosby",      role: "manager",     initials: "TM", online: true  },
  { name: "Rachel Green",   role: "salesperson", initials: "RG", online: true  },
  { name: "Chandler Bing",  role: "salesperson", initials: "CB", online: false },
];

function setSessionBadge() {
  const btn = $("#btnLogout");
  if (btn) btn.hidden = !state.session;

  // Analytics link: only visible for manager role
  const navAnalytics = $("#navAnalytics");
  if (navAnalytics) navAnalytics.hidden = !(state.session && state.session.role === "manager");

  const avatarEl   = $("#topbarAvatarEl");
  const usernameEl = $("#topbarUsername");
  const roleEl     = $("#topbarRole");

  if (state.session) {
    const initials = state.session.username.slice(0, 2).toUpperCase();
    if (avatarEl)   avatarEl.textContent   = initials;
    if (usernameEl) usernameEl.textContent = state.session.username;
    if (roleEl)     roleEl.textContent     = state.session.role;
  } else {
    if (avatarEl)   avatarEl.textContent   = "?";
    if (usernameEl) usernameEl.textContent = "Guest";
    if (roleEl)     roleEl.textContent     = "Not signed in";
  }
}

function renderPeopleOnline() {
  const wrap = $("#peopleOnline");
  const countEl = $("#onlineCount");
  if (!wrap) return;

  const onlineList = MOCK_EMPLOYEES.filter(e => e.online);
  if (countEl) countEl.textContent = `${onlineList.length} online`;

  wrap.innerHTML = MOCK_EMPLOYEES.map(e => `
    <div class="person-item" title="${escapeHtml(e.name)} — ${escapeHtml(e.role)}">
      <div class="person-avatar">${escapeHtml(e.initials)}</div>
      <div class="person-info"><div class="person-name">${escapeHtml(e.name)}</div><div class="person-role">${escapeHtml(e.role)}</div></div>
      <span class="status-dot ${e.online ? "online" : "offline"}"></span>
    </div>
  `).join("");
}

/* ---- Data operations ---- */

function upsertVehicle(vehicle) {
  const vin = vehicle.vin.trim();
  if (!vin) throw new Error("VIN is required.");

  const idx = state.vehicles.findIndex(v => v.vin === vin);
  if (idx >= 0) state.vehicles[idx] = { ...state.vehicles[idx], ...vehicle, vin };
  else state.vehicles.push({ ...vehicle, id: uid("veh"), vin });

  saveState();
}

function deleteVehicle(vin) {
  state.vehicles = state.vehicles.filter(v => v.vin !== vin);
  saveState();
}

function upsertCustomer(customer) {
  const license = customer.license.trim();
  if (!license) throw new Error("Driver's license is required.");

  const idx = state.customers.findIndex(c => c.license === license);
  if (idx >= 0) state.customers[idx] = { ...state.customers[idx], ...customer, license };
  else state.customers.push({ ...customer, id: uid("cust"), license, txHistory: [] });

  saveState();
}

function deleteCustomer(license) {
  state.customers = state.customers.filter(c => c.license !== license);
  saveState();
}

/* ---- Employee operations ---- */

function upsertEmployee(emp) {
  if (!emp.name || !emp.name.trim()) throw new Error("Employee name is required.");
  if (!emp.username || !emp.username.trim()) throw new Error("Username is required.");
  const id = emp.id || uid("emp");
  const record = {
    ...emp,
    id,
    name: emp.name.trim(),
    username: emp.username.trim(),
    initials: emp.name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    online: emp.online ?? false
  };
  const idx = state.employees.findIndex(e => e.id === id);
  if (idx >= 0) state.employees[idx] = record;
  else state.employees.push(record);
  saveState();
}

function deleteEmployee(id) {
  state.employees = state.employees.filter(e => e.id !== id);
  saveState();
}

/* ---- Driver's license operations ---- */

function upsertDriverLicense(dl) {
  if (!dl.licenseNo || !dl.licenseNo.trim()) throw new Error("License number is required.");
  if (!dl.customerId) throw new Error("Customer is required.");
  const id = dl.id || uid("dl");
  const record = { ...dl, id, licenseNo: dl.licenseNo.trim() };
  const idx = state.driverLicenses.findIndex(d => d.id === id);
  if (idx >= 0) state.driverLicenses[idx] = record;
  else state.driverLicenses.push(record);
  saveState();
}

function deleteDriverLicense(id) {
  state.driverLicenses = state.driverLicenses.filter(d => d.id !== id);
  saveState();
}

/* ---- Credit card operations ---- */

function upsertCreditCard(cc) {
  if (!cc.last4 || cc.last4.trim().length !== 4) throw new Error("Last 4 digits are required.");
  if (!cc.customerId) throw new Error("Customer is required.");
  const id = cc.id || uid("cc");
  const record = { ...cc, id, last4: cc.last4.trim() };
  const idx = state.creditCards.findIndex(c => c.id === id);
  if (idx >= 0) state.creditCards[idx] = record;
  else state.creditCards.push(record);
  saveState();
}

function deleteCreditCard(id) {
  state.creditCards = state.creditCards.filter(c => c.id !== id);
  saveState();
}

function getDiscountPerks(finalPurchaseUSD) {
  const rule = state.settings.discountRule ?? DEFAULT_DISCOUNT_RULE;
  return (Number(finalPurchaseUSD) >= Number(rule.thresholdUSD)) ? [rule.perkText] : [];
}

function commissionRateForMonthlySales(totalSalesUSD) {
  const s = Number(totalSalesUSD || 0);
  if (s <= 100000) return 0.05;
  if (s <= 200000) return 0.07;
  return 0.10;
}

function monthlySalesForUser(username, yyyyMM) {
  return state.transactions
    .filter(tx => tx.salesperson === username && tx.date.startsWith(yyyyMM))
    .reduce((sum, tx) => sum + Number(tx.finalPurchaseUSD || 0), 0);
}

function calculateCommission(username, yyyyMM) {
  const total = monthlySalesForUser(username, yyyyMM);
  const rate = commissionRateForMonthlySales(total);
  return { totalSalesUSD: total, rate, commissionUSD: total * rate };
}

function buildInvoiceText(tx) {
  const customer = state.customers.find(c => c.id === tx.customerId);
  const vehicle = state.vehicles.find(v => v.vin === tx.vehicleVinBuy);
  if (!customer) throw new Error("Invoice error: customer missing.");
  if (!vehicle) throw new Error("Invoice error: vehicle missing.");

  const perks = getDiscountPerks(tx.finalPurchaseUSD);

  const lines = [
    "MR. TUCKER'S CAR DEALERSHIP",
    "INVOICE",
    "------------------------------------------------------------",
    `Invoice #: ${tx.invoiceNo}`,
    `Date:      ${tx.date}`,
    `Type:      ${tx.type.toUpperCase()}`,
    `Salesperson: ${tx.salesperson}`,
    "",
    "CUSTOMER",
    `Name: ${customer.first} ${customer.middle ? customer.middle + ". " : ""}${customer.last}`,
    `Address: ${customer.address}`,
    `Phone: ${customer.phone1}${customer.phone2 ? " | " + customer.phone2 : ""}`,
    `Driver's License: ${customer.license}`,
    "",
    "VEHICLE",
    `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.condition})`,
    `VIN: ${vehicle.vin}`,
    `Mileage: ${vehicle.mileage ?? 0}`,
    "",
    "PAYMENT SUMMARY"
  ];

  if (tx.type === "tradein") {
    lines.push(`Vehicle price:       ${formatUSD(tx.vehiclePriceUSD)}`);
    lines.push(`Trade-in value:     -${formatUSD(tx.tradeInValueUSD)}`);
    lines.push(`----------------------------------------`);
  }
  lines.push(`Final purchase:      ${formatUSD(tx.finalPurchaseUSD)}`);

  if (perks.length) {
    lines.push("");
    lines.push("DISCOUNTS / PERKS");
    perks.forEach(p => lines.push(`- ${p}`));
  }

  lines.push("");
  lines.push("Thank you for your business!");
  return lines.join("\n");
}

function validateCustomerForPurchase(customer) {
  if (!customer.license || customer.license.trim().length < 3) {
    throw new Error("Customer must have a valid driver's license to purchase.");
  }
}

function createTransaction(txInput) {
  const customer = state.customers.find(c => c.id === txInput.customerId);
  const vehicle = state.vehicles.find(v => v.vin === txInput.vehicleVinBuy);

  if (!customer) throw new Error("Customer not found.");
  if (!vehicle) throw new Error("Vehicle not found.");

  validateCustomerForPurchase(customer);

  if (Number(vehicle.stock) <= 0) throw new Error("Vehicle is out of stock.");

  const vehiclePriceUSD = txInput.priceOverrideUSD ?? Number(vehicle.price);
  const tradeInValueUSD = txInput.type === "tradein" ? Number(txInput.tradeInValueUSD || 0) : 0;
  const finalPurchaseUSD = Math.max(0, vehiclePriceUSD - tradeInValueUSD);

  const tx = {
    id: uid("tx"),
    type: txInput.type,
    date: txInput.date,
    customerId: txInput.customerId,
    salesperson: txInput.salesperson,
    vehicleVinBuy: vehicle.vin,
    vehiclePriceUSD,
    tradeIn: txInput.type === "tradein" ? txInput.tradeIn : null,
    tradeInValueUSD,
    finalPurchaseUSD,
    invoiceNo: `INV-${Date.now().toString(36).toUpperCase()}`
  };

  state.transactions.unshift(tx);

  vehicle.stock = Number(vehicle.stock) - 1;

  if (tx.type === "tradein" && txInput.tradeIn) {
    state.vehicles.unshift({
      id: uid("veh"),
      vin: `TRADE-${Date.now().toString(36).toUpperCase()}`,
      make: txInput.tradeIn.make || "Unknown",
      model: txInput.tradeIn.model || "Unknown",
      year: Number(txInput.tradeIn.year || new Date().getFullYear()),
      category: "family",
      condition: "trade-in",
      mileage: Number(txInput.tradeIn.mileage || 0),
      price: Number(txInput.tradeIn.estimatedResaleUSD || 0),
      stock: 1
    });
  }

  customer.txHistory = customer.txHistory || [];
  customer.txHistory.unshift({ txId: tx.id, date: tx.date, type: tx.type, amountUSD: tx.finalPurchaseUSD });

  state.invoices[tx.id] = buildInvoiceText(tx);
  saveState();
  return tx;
}

function globalSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return { vehicles: [], customers: [], transactions: [] };

  const vehicles = state.vehicles.filter(v =>
    [v.vin, v.make, v.model, v.category, v.condition, String(v.year)]
      .some(x => String(x || "").toLowerCase().includes(q))
  );

  const customers = state.customers.filter(c =>
    [c.first, c.middle, c.last, c.license, c.phone1, c.phone2, c.address]
      .some(x => String(x || "").toLowerCase().includes(q))
  );

  const transactions = state.transactions.filter(t =>
    [t.id, t.invoiceNo, t.salesperson, t.date, t.type, t.vehicleVinBuy]
      .some(x => String(x || "").toLowerCase().includes(q))
  );

  return { vehicles, customers, transactions };
}

/* ---- Rendering ---- */

let selectedInvoiceTxId = null;

function renderDashboard() {
  if (!$("#statVehicles")) return;
  $("#statVehicles").textContent = String(state.vehicles.length);
  $("#statCustomers").textContent = String(state.customers.length);
  $("#statTransactions").textContent = String(state.transactions.length);

  const [latestTx] = state.transactions;
  const recent = $("#recentInvoice");
  if (recent) recent.textContent = latestTx ? (state.invoices[latestTx.id] ?? "—") : "No invoices yet.";
}

function renderInventory() {
  const wrap = $("#inventoryList");
  if (!wrap) return;

  const q = ($("#inventoryFilter")?.value || "").trim().toLowerCase();
  const vehicles = state.vehicles.filter(v =>
    !q || [v.vin, v.make, v.model].some(x => String(x || "").toLowerCase().includes(q))
  );

  if (!vehicles.length) {
    wrap.innerHTML = `<div class="muted small">No vehicles found.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table aria-label="Inventory">
      <thead>
        <tr>
          <th>VIN</th><th>Vehicle</th><th>Type</th><th>Category</th>
          <th>Mileage</th><th>Price</th><th>Stock</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${vehicles.map(v => `
          <tr>
            <td class="mono">${escapeHtml(v.vin)}</td>
            <td>${escapeHtml(v.year)} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</td>
            <td>${escapeHtml(v.condition)}</td>
            <td>${escapeHtml(v.category)}</td>
            <td>${escapeHtml(v.mileage ?? 0)}</td>
            <td>${formatUSD(v.price)}</td>
            <td>${escapeHtml(v.stock)}</td>
            <td>
              <button class="btn" data-act="editVehicle" data-vin="${escapeAttr(v.vin)}" type="button">Edit</button>
              <button class="btn" data-act="delVehicle" data-vin="${escapeAttr(v.vin)}" type="button">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCustomers() {
  const wrap = $("#customerList");
  if (!wrap) return;

  const q = ($("#customerFilter")?.value || "").trim().toLowerCase();
  const customers = state.customers.filter(c => {
    if (!q) return true;
    const name = `${c.first} ${c.middle || ""} ${c.last}`.toLowerCase();
    return (
      name.includes(q) ||
      String(c.license || "").toLowerCase().includes(q) ||
      String(c.phone1 || "").toLowerCase().includes(q) ||
      String(c.phone2 || "").toLowerCase().includes(q)
    );
  });

  if (!customers.length) {
    wrap.innerHTML = `<div class="muted small">No customers found.</div>`;
    return;
  }

  wrap.innerHTML = `
    <table aria-label="Customers">
      <thead>
        <tr>
          <th>Name</th><th>License</th><th>Credit</th><th>Phones</th>
          <th>Address</th><th>Tx history</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${customers.map(c => `
          <tr>
            <td>${escapeHtml(c.first)} ${escapeHtml(c.middle ? c.middle + "." : "")} ${escapeHtml(c.last)}</td>
            <td class="mono">${escapeHtml(c.license)}</td>
            <td>${escapeHtml(c.creditScore)}</td>
            <td>${escapeHtml(c.phone1)}${c.phone2 ? "<br/>" + escapeHtml(c.phone2) : ""}</td>
            <td>${escapeHtml(c.address)}</td>
            <td class="mono small">${escapeHtml((c.txHistory || []).slice(0,3).map(t => `${t.date}:${t.type}:${Math.round(t.amountUSD)}`).join(" | ") || "—")}</td>
            <td>
              <button class="btn" data-act="editCustomer" data-license="${escapeAttr(c.license)}" type="button">Edit</button>
              <button class="btn" data-act="delCustomer" data-license="${escapeAttr(c.license)}" type="button">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function refreshTransactionSelects() {
  const custSel = $("#txCustomer");
  const vehSel = $("#txVehicleBuy");
  if (!custSel || !vehSel) return;

  custSel.innerHTML = state.customers.length
    ? state.customers.map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.first)} ${escapeHtml(c.last)} — ${escapeHtml(c.license)}</option>`).join("")
    : `<option value="">(No customers — add one first)</option>`;

  const available = state.vehicles.filter(v => Number(v.stock) > 0);
  vehSel.innerHTML = available.length
    ? available.map(v => `<option value="${escapeAttr(v.vin)}">${escapeHtml(v.year)} ${escapeHtml(v.make)} ${escapeHtml(v.model)} — ${escapeHtml(v.vin)} (stock ${escapeHtml(v.stock)})</option>`).join("")
    : `<option value="">(No vehicles in stock — add inventory)</option>`;
}

function renderTransactions() {
  const wrap = $("#txList");
  if (!wrap) return;

  if (!state.transactions.length) {
    wrap.innerHTML = `<div class="muted small">No transactions yet.</div>`;
    $("#invoicePreview") && ($("#invoicePreview").textContent = "No invoice selected.");
    $("#btnPrintInvoice") && ($("#btnPrintInvoice").disabled = true);
    $("#btnCopyInvoice") && ($("#btnCopyInvoice").disabled = true);
    return;
  }

  wrap.innerHTML = `
    <table aria-label="Transactions">
      <thead>
        <tr>
          <th>Date</th><th>Type</th><th>Customer</th><th>Vehicle VIN</th>
          <th>Final</th><th>Invoice</th><th>Salesperson</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${state.transactions.map(tx => {
          const customer = state.customers.find(c => c.id === tx.customerId);
          const name = customer ? `${customer.first} ${customer.last}` : "Unknown";
          return `
            <tr>
              <td>${escapeHtml(tx.date)}</td>
              <td>${escapeHtml(tx.type)}</td>
              <td>${escapeHtml(name)}</td>
              <td class="mono">${escapeHtml(tx.vehicleVinBuy)}</td>
              <td>${formatUSD(tx.finalPurchaseUSD)}</td>
              <td class="mono">${escapeHtml(tx.invoiceNo)}</td>
              <td class="mono">${escapeHtml(tx.salesperson)}</td>
              <td>
                <button class="btn" data-act="viewInvoice" data-tx="${escapeAttr(tx.id)}" type="button">View</button>
                <button class="btn" data-act="delTx" data-tx="${escapeAttr(tx.id)}" type="button">Delete</button>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  if (selectedInvoiceTxId && state.invoices[selectedInvoiceTxId] && $("#invoicePreview")) {
    $("#invoicePreview").textContent = state.invoices[selectedInvoiceTxId];
    $("#btnPrintInvoice") && ($("#btnPrintInvoice").disabled = false);
    $("#btnCopyInvoice") && ($("#btnCopyInvoice").disabled = false);
  }
}

function renderReports() {
  const wrap = $("#salesOverview");
  if (!wrap) return;

  const totals = {};
  let grand = 0;
  for (const tx of state.transactions) {
    grand += Number(tx.finalPurchaseUSD || 0);
    totals[tx.salesperson] = (totals[tx.salesperson] || 0) + Number(tx.finalPurchaseUSD || 0);
  }

  const lines = [];
  lines.push(`Total sales (all time): ${formatUSD(grand)}`);
  lines.push("");
  lines.push("By salesperson:");
  const entries = Object.entries(totals).sort((a,b) => b[1] - a[1]);
  if (!entries.length) lines.push("—");
  for (const [u, amt] of entries) lines.push(`- ${u}: ${formatUSD(amt)}`);
  wrap.textContent = lines.join("\n");

  const invWrap = $("#inventoryHealth");
  if (!invWrap) return;

  const low = state.vehicles.slice().sort((a,b) => Number(a.stock) - Number(b.stock)).slice(0, 12);
  invWrap.innerHTML = `
    <table aria-label="Inventory health">
      <thead><tr><th>Vehicle</th><th>VIN</th><th>Stock</th><th>Condition</th><th>Price</th></tr></thead>
      <tbody>
        ${low.map(v => `
          <tr>
            <td>${escapeHtml(v.year)} ${escapeHtml(v.make)} ${escapeHtml(v.model)}</td>
            <td class="mono">${escapeHtml(v.vin)}</td>
            <td>${escapeHtml(v.stock)}</td>
            <td>${escapeHtml(v.condition)}</td>
            <td>${formatUSD(v.price)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSearch() {
  const wrap = $("#searchResults");
  if (!wrap) return;

  const q = $("#globalSearch")?.dataset?.lastQuery || "";
  if (!q) {
    wrap.innerHTML = `<div class="muted small">Enter a query to search.</div>`;
    return;
  }

  const res = globalSearch(q);

  wrap.innerHTML = `
    <div class="card">
      <h2>Vehicles</h2>
      ${res.vehicles.length ? res.vehicles.map(v => `
        <div class="muted small mono">${escapeHtml(v.vin)} — ${escapeHtml(v.year)} ${escapeHtml(v.make)} ${escapeHtml(v.model)} (${escapeHtml(v.condition)}), stock ${escapeHtml(v.stock)}</div>
      `).join("") : `<div class="muted small">No matches.</div>`}
    </div>

    <div class="card">
      <h2>Customers</h2>
      ${res.customers.length ? res.customers.map(c => `
        <div class="muted small mono">${escapeHtml(c.license)} — ${escapeHtml(c.first)} ${escapeHtml(c.last)} (${escapeHtml(c.phone1)})</div>
      `).join("") : `<div class="muted small">No matches.</div>`}
    </div>

    <div class="card">
      <h2>Transactions</h2>
      ${res.transactions.length ? res.transactions.map(t => `
        <div class="muted small mono">${escapeHtml(t.invoiceNo)} — ${escapeHtml(t.date)} ${escapeHtml(t.type)} ${formatUSD(t.finalPurchaseUSD)} (${escapeHtml(t.salesperson)})</div>
      `).join("") : `<div class="muted small">No matches.</div>`}
    </div>
  `;
}

function updateNavBadges() {
  const nbInv = $("#nbInventory");
  const nbCust = $("#nbCustomers");
  const nbTx = $("#nbTransactions");
  const nbEmp = $("#nbEmployees");
  if (nbInv) nbInv.textContent = state.vehicles.length || "";
  if (nbCust) nbCust.textContent = state.customers.length || "";
  if (nbTx) nbTx.textContent = state.transactions.length || "";
  if (nbEmp) nbEmp.textContent = (MOCK_EMPLOYEES.length + state.employees.length) || "";
}

function renderSettings() {
  const rule = state.settings.discountRule ?? DEFAULT_DISCOUNT_RULE;
  const tEl = $("#dcThresholdText");
  if (tEl) tEl.textContent = `Purchases over ${formatUSD(rule.thresholdUSD)} get: "${rule.perkText}"`;
  renderDcPreview();
}

function renderUtilities() {
  const darkToggle = $("#utilDarkToggle");
  if (darkToggle && !darkToggle._wired) {
    darkToggle._wired = true;
    darkToggle.checked = document.documentElement.classList.contains("dark");
    darkToggle.addEventListener("change", () => {
      const isDark = darkToggle.checked;
      document.documentElement.classList.toggle("dark", isDark);
      localStorage.setItem("mt_theme", isDark ? "dark" : "light");
      syncThemeIcon();
    });
  }
}

function renderEmployeesPage() {
  const allEmployees = [
    ...MOCK_EMPLOYEES.map(e => ({ ...e, isMock: true })),
    ...state.employees.map(e => ({ ...e, isMock: false }))
  ];

  const totalEl = $("#empStatTotal");
  const onlineEl = $("#empStatOnline");
  const managersEl = $("#empStatManagers");
  if (totalEl) totalEl.textContent = String(allEmployees.length);
  if (onlineEl) onlineEl.textContent = String(allEmployees.filter(e => e.online).length);
  if (managersEl) managersEl.textContent = String(allEmployees.filter(e => e.role === "manager").length);

  const wrap = $("#employeesTable");
  if (!wrap) return;

  wrap.innerHTML = `
    <table aria-label="Employees">
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${allEmployees.map(e => `
          <tr>
            <td><span class="emp-row-avatar">${escapeHtml(e.initials || e.name.slice(0,2).toUpperCase())}</span>${escapeHtml(e.name)}</td>
            <td class="mono">${escapeHtml(e.username || "—")}</td>
            <td>${escapeHtml(e.role)}</td>
            <td>${escapeHtml(e.department || "—")}</td>
            <td><span class="badge ${e.online ? "ok" : "subtle"}">${e.online ? "Online" : "Offline"}</span></td>
            <td>${e.isMock
              ? `<span class="muted small">Demo</span>`
              : `<button class="btn" data-act="editEmp" data-id="${escapeAttr(e.id)}" type="button">Edit</button>
                 <button class="btn" data-act="delEmp" data-id="${escapeAttr(e.id)}" type="button">Remove</button>`
            }</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function refreshCustomerFormSelects() {
  ["dlCustomer", "ccCustomer"].forEach(selId => {
    const sel = $("#" + selId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="">— select a customer —</option>` +
      state.customers.map(c =>
        `<option value="${escapeAttr(c.id)}">${escapeHtml(c.first)} ${escapeHtml(c.last)} — ${escapeHtml(c.license)}</option>`
      ).join("");
    if (prev) sel.value = prev;
  });
}

function renderDriverLicenseList() {
  const wrap = $("#dlList");
  if (!wrap) return;
  if (!state.driverLicenses.length) {
    wrap.innerHTML = `<div class="muted small" style="padding:12px 0">No driver's licenses on file.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table aria-label="Driver's Licenses">
      <thead>
        <tr><th>Holder</th><th>License #</th><th>DOB</th><th>Expires</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${state.driverLicenses.map(dl => `
          <tr>
            <td>${escapeHtml(dl.holderName)}</td>
            <td class="mono">${escapeHtml(dl.licenseNo)}</td>
            <td>${escapeHtml(dl.birthDate || "—")}</td>
            <td>${escapeHtml(dl.expirationDate || "—")}</td>
            <td>
              <button class="btn" data-act="editDl" data-id="${escapeAttr(dl.id)}" type="button">Edit</button>
              <button class="btn" data-act="delDl" data-id="${escapeAttr(dl.id)}" type="button">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCreditCardList() {
  const wrap = $("#ccList");
  if (!wrap) return;
  if (!state.creditCards.length) {
    wrap.innerHTML = `<div class="muted small" style="padding:12px 0">No credit cards on file.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table aria-label="Credit Cards">
      <thead>
        <tr><th>Holder</th><th>Card</th><th>Expires</th><th>Zip</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${state.creditCards.map(cc => `
          <tr>
            <td>${escapeHtml(cc.holderName)}</td>
            <td class="mono">•••• •••• •••• ${escapeHtml(cc.last4)}</td>
            <td class="mono">${escapeHtml(cc.expirationDate)}</td>
            <td>${escapeHtml(cc.zipCode)}</td>
            <td>
              <button class="btn" data-act="editCc" data-id="${escapeAttr(cc.id)}" type="button">Edit</button>
              <button class="btn" data-act="delCc" data-id="${escapeAttr(cc.id)}" type="button">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function rerenderAll() {
  setSessionBadge();
  renderPeopleOnline();
  updateNavBadges();
  renderDashboard();
  renderInventory();
  renderCustomers();
  refreshTransactionSelects();
  refreshCustomerFormSelects();
  renderTransactions();
  renderReports();
  renderSearch();
  renderSettings();
  renderUtilities();
  renderEmployeesPage();
  renderDriverLicenseList();
  renderCreditCardList();
}

/* ---- Wiring ---- */

$("#btnLogout") && $("#btnLogout").addEventListener("click", logout);

$("#loginForm") && $("#loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const username = $("#loginUser").value.trim();
  const password = $("#loginPass").value;
  const role = $("#loginRole").value;

  if (!login(username, password, role)) {
    toast("Invalid password (demo password is 'demo').");
    return;
  }
  toast(`Signed in as ${username}`);

  // Cinematic exit: spinner button + card scale-fade
  const btn = document.querySelector('#loginForm button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="spin" width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7.5 1A6.5 6.5 0 0 1 14 7.5"/></svg> Signing in\u2026';
  }
  const card = document.querySelector('.auth-card');
  if (card) {
    card.style.transition = 'opacity 300ms ease, transform 300ms cubic-bezier(0.4,0,1,1)';
    card.style.opacity = '0';
    card.style.transform = 'scale(1.03) translateY(-8px)';
  }
  sessionStorage.setItem('mt_from_login', '1');
  setTimeout(() => { window.location.href = "dashboard.html"; }, 310);
});

$("#btnLoadDemo") && $("#btnLoadDemo").addEventListener("click", () => {
  loadDemoData();
  toast("Demo data loaded.");
  rerenderAll();
});

$("#vehicleForm") && $("#vehicleForm").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const v = {
      id: $("#vehicleId").value || undefined,
      vin: $("#vehicleVin").value,
      make: $("#vehicleMake").value,
      model: $("#vehicleModel").value,
      year: Number($("#vehicleYear").value),
      category: $("#vehicleCategory").value,
      condition: $("#vehicleCondition").value,
      mileage: Number($("#vehicleMileage").value || 0),
      price: Number($("#vehiclePrice").value),
      stock: Number($("#vehicleStock").value)
    };
    upsertVehicle(v);
    toast("Vehicle saved.");
    $("#vehicleForm").reset();
    $("#vehicleId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save vehicle.");
  }
});

$("#btnVehicleReset") && $("#btnVehicleReset").addEventListener("click", () => {
  $("#vehicleForm").reset();
  $("#vehicleId").value = "";
});

$("#inventoryFilter") && $("#inventoryFilter").addEventListener("input", renderInventory);

$("#inventoryList") && $("#inventoryList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const vin = btn.dataset.vin;

  if (act === "editVehicle") {
    const v = state.vehicles.find(x => x.vin === vin);
    if (!v) return;
    $("#vehicleId").value = v.id || "";
    $("#vehicleVin").value = v.vin;
    $("#vehicleMake").value = v.make;
    $("#vehicleModel").value = v.model;
    $("#vehicleYear").value = v.year;
    $("#vehicleCategory").value = v.category;
    $("#vehicleCondition").value = v.condition;
    $("#vehicleMileage").value = v.mileage ?? 0;
    $("#vehiclePrice").value = v.price;
    $("#vehicleStock").value = v.stock;
    toast("Editing vehicle.");
  }

  if (act === "delVehicle") {
    deleteVehicle(vin);
    toast("Vehicle deleted.");
    rerenderAll();
  }
});

$("#btnExportInventory") && $("#btnExportInventory").addEventListener("click", () => {
  downloadJson(state.vehicles, "inventory.json");
});

$("#customerForm") && $("#customerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const c = {
      id: $("#customerId").value || undefined,
      first: $("#custFirst").value.trim(),
      middle: $("#custMiddle").value.trim(),
      last: $("#custLast").value.trim(),
      address: $("#custAddress").value.trim(),
      phone1: $("#custPhone1").value.trim(),
      phone2: $("#custPhone2").value.trim(),
      license: $("#custLicense").value.trim(),
      creditScore: Number($("#custCredit").value)
    };
    upsertCustomer(c);

    // Add form data into prisma
    await apiPost("customers", {
      customer_name:      `${c.first} ${c.middle ? c.middle + " " : ""}${c.last}`.trim(),
      credit_score:       c.creditScore,
      drivers_license_id: Number(c.license),
      credit_card_number: 0        
    });

    toast("Customer saved.");
    $("#customerForm").reset();
    $("#customerId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save customer.");
  }
});

$("#btnCustomerReset") && $("#btnCustomerReset").addEventListener("click", () => {
  $("#customerForm").reset();
  $("#customerId").value = "";
});

$("#customerFilter") && $("#customerFilter").addEventListener("input", renderCustomers);

$("#customerList") && $("#customerList").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const license = btn.dataset.license;

  if (act === "editCustomer") {
    const c = state.customers.find(x => x.license === license);
    if (!c) return;
    $("#customerId").value = c.id || "";
    $("#custFirst").value = c.first;
    $("#custMiddle").value = c.middle || "";
    $("#custLast").value = c.last;
    $("#custAddress").value = c.address;
    $("#custPhone1").value = c.phone1;
    $("#custPhone2").value = c.phone2 || "";
    $("#custLicense").value = c.license;
    $("#custCredit").value = c.creditScore;
    toast("Editing customer.");
  }

  if (act === "delCustomer") {
    deleteCustomer(license);

    // Delete form data from prisma
    await apiDelete(`customers/${customerId}`);

    toast("Customer deleted.");
    rerenderAll();
  }
});

$("#btnExportCustomers") && $("#btnExportCustomers").addEventListener("click", () => {
  downloadJson(state.customers, "customers.json");
});

(function initTxDate() {
  if (!$("#txDate")) return;
  $("#txDate").value = new Date().toISOString().slice(0, 10);
})();

$("#txType") && $("#txType").addEventListener("change", () => {
  const isTrade = $("#txType").value === "tradein";
  $("#tradeinFields").hidden = !isTrade;
});

$("#txForm") && $("#txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const type = $("#txType").value;
    const txInput = {
      type,
      date: $("#txDate").value,
      customerId: $("#txCustomer").value,
      salesperson: $("#txSalesperson").value.trim(),
      vehicleVinBuy: $("#txVehicleBuy").value,
      priceOverrideUSD: $("#txPriceOverride").value ? Number($("#txPriceOverride").value) : null,
      tradeInValueUSD: type === "tradein" ? Number($("#txTradeValue").value || 0) : 0,
      tradeIn: type === "tradein" ? {
        make: $("#txTradeMake").value.trim(),
        model: $("#txTradeModel").value.trim(),
        year: Number($("#txTradeYear").value || 0),
        mileage: Number($("#txTradeMileage").value || 0),
        conditionNote: $("#txTradeCondition").value.trim(),
        estimatedResaleUSD: Number($("#txTradeValue").value || 0)
      } : null
    };

    const tx = createTransaction(txInput);
    toast(`Saved. Invoice ${tx.invoiceNo} created.`);
    $("#txForm").reset();
    $("#txDate").value = new Date().toISOString().slice(0,10);
    $("#tradeinFields").hidden = true;
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save transaction.");
  }
});

$("#btnTxReset") && $("#btnTxReset").addEventListener("click", () => {
  $("#txForm").reset();
  $("#txDate").value = new Date().toISOString().slice(0,10);
  $("#tradeinFields").hidden = true;
});

$("#btnExportTx") && $("#btnExportTx").addEventListener("click", () => downloadJson(state.transactions, "transactions.json"));

$("#btnClearInvoices") && $("#btnClearInvoices").addEventListener("click", () => {
  state.invoices = {};
  saveState();
  selectedInvoiceTxId = null;
  toast("Invoices cleared.");
  rerenderAll();
});

$("#txList") && $("#txList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const txId = btn.dataset.tx;

  if (act === "viewInvoice") {
    selectedInvoiceTxId = txId;
    $("#invoicePreview") && ($("#invoicePreview").textContent = state.invoices[txId] || "Invoice not found.");
    $("#btnPrintInvoice") && ($("#btnPrintInvoice").disabled = !state.invoices[txId]);
    $("#btnCopyInvoice") && ($("#btnCopyInvoice").disabled = !state.invoices[txId]);
    toast("Invoice loaded.");
  }

  if (act === "delTx") {
    state.transactions = state.transactions.filter(t => t.id !== txId);
    delete state.invoices[txId];
    saveState();
    toast("Transaction deleted.");
    rerenderAll();
  }
});

$("#btnPrintInvoice") && $("#btnPrintInvoice").addEventListener("click", () => {
  if (!selectedInvoiceTxId) return;
  const invoiceText = state.invoices[selectedInvoiceTxId];
  if (!invoiceText) return;

  const w = window.open("", "_blank", "width=800,height=900");
  w.document.write(`
    <pre style="font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; font-size: 12px;">
${escapeHtml(invoiceText)}
    </pre>
  `);
  w.document.close();
  w.focus();
  w.print();
});

$("#btnCopyInvoice") && $("#btnCopyInvoice").addEventListener("click", async () => {
  if (!selectedInvoiceTxId) return;
  const invoiceText = state.invoices[selectedInvoiceTxId];
  if (!invoiceText) return;
  await navigator.clipboard.writeText(invoiceText);
  toast("Invoice copied.");
});

$("#commissionForm") && $("#commissionForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const yyyyMM = $("#commMonth").value;
  const user = $("#commUser").value.trim();

  const result = calculateCommission(user, yyyyMM);

  const box = $("#commissionResult");
  box.hidden = false;
  box.innerHTML = `
    <div><strong>${escapeHtml(user)}</strong> for <strong>${escapeHtml(yyyyMM)}</strong></div>
    <div>Total sales: <span class="mono">${formatUSD(result.totalSalesUSD)}</span></div>
    <div>Rate: <span class="mono">${Math.round(result.rate * 100)}%</span></div>
    <div>Commission: <span class="mono">${formatUSD(result.commissionUSD)}</span></div>
  `;
});

$("#btnSearch") && $("#btnSearch").addEventListener("click", () => {
  const q = $("#globalSearch").value;
  $("#globalSearch").dataset.lastQuery = q;
  renderSearch();
});
$("#globalSearch") && $("#globalSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("#btnSearch").click(); }
});

/* ━━ Topbar search redirect ━━ */
(function initTopbarSearch() {
  const inp = $("#topbarSearchInput");
  if (!inp) return;
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && inp.value.trim()) {
      window.location.href = `search.html?q=${encodeURIComponent(inp.value.trim())}`;
    }
  });
})();

/* ━━ Discount Calculator ━━ */
let _dcType = "percent";
const _dcQuotes = [];

function renderDcPreview() {
  const finalEl = $("#dcFinalValue");
  const subEl   = $("#dcPreviewSub");
  const bkEl    = $("#dcBreakdown");
  if (!finalEl) return;

  const orig     = parseFloat($("#dcOriginal")?.value || "0") || 0;
  const discVal  = parseFloat($("#dcDiscount")?.value  || "0") || 0;
  const taxRate  = parseFloat($("#dcTax")?.value       || "0") || 0;

  if (!orig) {
    finalEl.textContent = "—";
    if (subEl) subEl.textContent = "Enter values to see breakdown";
    if (bkEl)  bkEl.innerHTML = "";
    return;
  }

  const discountUSD = _dcType === "percent" ? orig * (discVal / 100) : discVal;
  const afterDisc   = Math.max(0, orig - discountUSD);
  const taxUSD      = afterDisc * (taxRate / 100);
  const final       = afterDisc + taxUSD;

  finalEl.textContent = formatUSD(final);
  if (subEl) subEl.textContent = `incl. ${taxRate}% tax`;

  if (bkEl) {
    bkEl.innerHTML = [
      ["Original price",  formatUSD(orig)],
      ["Discount",       `−${formatUSD(discountUSD)}`],
      ["After discount",  formatUSD(afterDisc)],
      ["Tax",            `+${formatUSD(taxUSD)}`],
      ["Final",           formatUSD(final)],
    ].map(([label, val]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
        <span class="muted small">${escapeHtml(label)}</span>
        <span class="mono small" style="font-weight:500">${escapeHtml(val)}</span>
      </div>
    `).join("");
  }
}

(function initDcForm() {
  if (!$("#dcForm")) return;

  ["dcOriginal","dcDiscount","dcTax"].forEach(id => {
    const el = $("#" + id);
    if (el) el.addEventListener("input", renderDcPreview);
  });

  document.querySelectorAll(".toggle-btn[data-type]").forEach(btn => {
    btn.addEventListener("click", () => {
      _dcType = btn.dataset.type;
      document.querySelectorAll(".toggle-btn[data-type]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const lbl = $("#dcDiscountLabel");
      if (lbl) lbl.childNodes[0].textContent = _dcType === "percent" ? "Discount %" : "Discount ($) ";
      renderDcPreview();
    });
  });

  $("#dcForm").addEventListener("submit", (e) => {
    e.preventDefault();
    renderDcPreview();
  });

  $("#btnDcReset")?.addEventListener("click", () => {
    $("#dcForm").reset();
    renderDcPreview();
  });

  $("#btnSaveQuote")?.addEventListener("click", () => {
    const orig    = parseFloat($("#dcOriginal")?.value || "0") || 0;
    const discVal = parseFloat($("#dcDiscount")?.value  || "0") || 0;
    const taxRate = parseFloat($("#dcTax")?.value       || "0") || 0;
    if (!orig) { toast("Enter a price first."); return; }

    const discountUSD = _dcType === "percent" ? orig * (discVal / 100) : discVal;
    const afterDisc   = Math.max(0, orig - discountUSD);
    const taxUSD      = afterDisc * (taxRate / 100);
    const final       = afterDisc + taxUSD;

    _dcQuotes.push({ orig, discountUSD, taxUSD, final, type: _dcType, discVal, taxRate, saved: new Date().toLocaleTimeString() });
    renderDcQuotes();
    toast("Quote saved.");
  });

  renderDcPreview();
})();

function renderDcQuotes() {
  const wrap = $("#dcQuotesList");
  if (!wrap) return;
  if (!_dcQuotes.length) { wrap.innerHTML = `<div class="muted small">No quotes saved yet.</div>`; return; }
  wrap.innerHTML = _dcQuotes.slice().reverse().map(q => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <span class="mono small" style="font-weight:600">${escapeHtml(formatUSD(q.final))}</span>
        <span class="muted small" style="margin-left:8px">orig ${escapeHtml(formatUSD(q.orig))} · disc ${escapeHtml(formatUSD(q.discountUSD))} · tax ${escapeHtml(formatUSD(q.taxUSD))}</span>
      </div>
      <span class="muted small">${escapeHtml(q.saved)}</span>
    </div>
  `).join("");
}

/* ━━ Utilities page ━━ */
(function initUtilities() {
  const csvBtn = $("#btnExportCSV");
  if (csvBtn) {
    csvBtn.addEventListener("click", () => {
      const headers = ["First","Middle","Last","License","Phone1","Phone2","Address","Credit Score"];
      const rows = state.customers.map(c => [c.first, c.middle||"", c.last, c.license, c.phone1, c.phone2||"", c.address, c.creditScore].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","));
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "customers.csv"; a.click();
      URL.revokeObjectURL(url);
    });
  }

  const cpForm = $("#changePassForm");
  if (cpForm) {
    cpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const current = $("#cpCurrent").value;
      const next    = $("#cpNew").value;
      const confirm = $("#cpConfirm").value;
      if (current !== "demo") { toast("Current password is incorrect."); return; }
      if (next !== confirm)   { toast("New passwords don't match."); return; }
      if (next !== "demo")    { toast("Demo system: password must remain 'demo'."); return; }
      toast("Password updated (demo — unchanged).");
      cpForm.reset();
    });
  }
})();

/* ━━ Search page: pre-fill from URL query ━━ */
(function initSearchPage() {
  const inp = $("#globalSearch");
  if (!inp) return;
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  if (q) {
    inp.value = q;
    inp.dataset.lastQuery = q;
    renderSearch();
  }
})();

/* ---- Employee form ---- */

$("#employeeForm") && $("#employeeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const emp = {
      id: $("#employeeId").value || undefined,
      name: $("#empName").value.trim(),
      username: $("#empUsername").value.trim(),
      role: $("#empRole").value,
      department: $("#empDepartment").value.trim()
    };
    upsertEmployee(emp);
    toast("Employee registered.");
    $("#employeeForm").reset();
    $("#employeeId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to register employee.");
  }
});

$("#btnEmpReset") && $("#btnEmpReset").addEventListener("click", () => {
  $("#employeeForm") && $("#employeeForm").reset();
  if ($("#employeeId")) $("#employeeId").value = "";
});

$("#employeesTable") && $("#employeesTable").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id  = btn.dataset.id;

  if (act === "editEmp") {
    const emp = state.employees.find(x => x.id === id);
    if (!emp) return;
    if ($("#employeeId")) {
      $("#employeeId").value = emp.id;
      if ($("#empName"))       $("#empName").value = emp.name;
      if ($("#empUsername"))   $("#empUsername").value = emp.username;
      if ($("#empRole"))       $("#empRole").value = emp.role;
      if ($("#empDepartment")) $("#empDepartment").value = emp.department || "";
      toast("Editing employee.");
    } else {
      location.href = "register-employee.html?edit=" + encodeURIComponent(id);
    }
  }

  if (act === "delEmp") {
    deleteEmployee(id);
    toast("Employee removed.");
    rerenderAll();
  }
});

/* ---- Driver's license form ---- */

$("#dlForm") && $("#dlForm").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    const dl = {
      id: $("#dlId").value || undefined,
      customerId: $("#dlCustomer").value,
      holderName: $("#dlHolderName").value.trim(),
      licenseNo: $("#dlLicenseNo").value.trim(),
      birthDate: $("#dlBirthDate").value,
      expirationDate: $("#dlExpDate").value,
      sex: $("#dlSex").value,
      eyeColor: $("#dlEyeColor").value.trim(),
      weight: $("#dlWeight").value.trim(),
      address: $("#dlAddress").value.trim(),
      restrictions: $("#dlRestrictions").value.trim()
    };
    upsertDriverLicense(dl);
    toast("Driver's license saved.");
    $("#dlForm").reset();
    $("#dlId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save license.");
  }
});

$("#btnDlReset") && $("#btnDlReset").addEventListener("click", () => {
  $("#dlForm") && $("#dlForm").reset();
  if ($("#dlId")) $("#dlId").value = "";
});

$("#dlList") && $("#dlList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id  = btn.dataset.id;

  if (act === "editDl") {
    const dl = state.driverLicenses.find(x => x.id === id);
    if (!dl) return;
    if ($("#dlId"))          $("#dlId").value = dl.id;
    if ($("#dlCustomer"))    $("#dlCustomer").value = dl.customerId;
    if ($("#dlHolderName"))  $("#dlHolderName").value = dl.holderName;
    if ($("#dlLicenseNo"))   $("#dlLicenseNo").value = dl.licenseNo;
    if ($("#dlBirthDate"))   $("#dlBirthDate").value = dl.birthDate || "";
    if ($("#dlExpDate"))     $("#dlExpDate").value = dl.expirationDate || "";
    if ($("#dlSex"))         $("#dlSex").value = dl.sex || "";
    if ($("#dlEyeColor"))    $("#dlEyeColor").value = dl.eyeColor || "";
    if ($("#dlWeight"))      $("#dlWeight").value = dl.weight || "";
    if ($("#dlAddress"))     $("#dlAddress").value = dl.address || "";
    if ($("#dlRestrictions")) $("#dlRestrictions").value = dl.restrictions || "";
    toast("Editing license.");
  }

  if (act === "delDl") {
    deleteDriverLicense(id);
    toast("License deleted.");
    rerenderAll();
  }
});

/* ---- Credit card form ---- */

$("#ccForm") && $("#ccForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const cc = {
      id: $("#ccId").value || undefined,
      customerId: $("#ccCustomer").value,
      holderName: $("#ccHolderName").value.trim(),
      last4: $("#ccLast4").value.trim(),
      expirationDate: $("#ccExpDate").value.trim(),
      zipCode: $("#ccZip").value.trim()
    };
    upsertCreditCard(cc);

    await apiPost("credit_cards", {
      credit_card_number: id,
      holder_name : holderName,
      security_code: last4,
      expiration_date: expirationDate,
      zip_code: zipCode
    })

    toast("Credit card saved.");
    $("#ccForm").reset();
    $("#ccId").value = "";
    rerenderAll();
  } catch (err) {
    toast(err.message || "Failed to save card.");
  }
});

$("#btnCcReset") && $("#btnCcReset").addEventListener("click", () => {
  $("#ccForm") && $("#ccForm").reset();
  if ($("#ccId")) $("#ccId").value = "";
});

$("#ccList") && $("#ccList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id  = btn.dataset.id;

  if (act === "editCc") {
    const cc = state.creditCards.find(x => x.id === id);
    if (!cc) return;
    if ($("#ccId"))         $("#ccId").value = cc.id;
    if ($("#ccCustomer"))   $("#ccCustomer").value = cc.customerId;
    if ($("#ccHolderName")) $("#ccHolderName").value = cc.holderName;
    if ($("#ccLast4"))      $("#ccLast4").value = cc.last4;
    if ($("#ccExpDate"))    $("#ccExpDate").value = cc.expirationDate;
    if ($("#ccZip"))        $("#ccZip").value = cc.zipCode;
    toast("Editing card.");
  }

  if (act === "delCc") {
    deleteCreditCard(id);
    
    apiDelete(`creditcard/${customerId}`);
    
    toast("Card deleted.");
    rerenderAll();
  }
});

/* ---- Customer-page form tabs ---- */
(function initCustomerFormTabs() {
  const tabsNav = $("#custFormTabs");
  if (!tabsNav) return;

  tabsNav.addEventListener("click", (e) => {
    const tab = e.target.closest(".form-tab");
    if (!tab) return;

    tabsNav.querySelectorAll(".form-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");

    ["panelCustomer", "panelLicense", "panelCard"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = (id !== tab.dataset.panel);
    });
  });
})();

/* ---- DL form: auto-fill from selected customer ---- */
(function initDlCustomerLink() {
  const sel = $("#dlCustomer");
  if (!sel) return;
  sel.addEventListener("change", () => {
    const cust = state.customers.find(c => c.id === sel.value);
    if (!cust) return;
    const holderEl = $("#dlHolderName");
    const licEl    = $("#dlLicenseNo");
    const addrEl   = $("#dlAddress");
    if (holderEl && !holderEl.value) holderEl.value = `${cust.first} ${cust.last}`.trim();
    if (licEl    && !licEl.value)    licEl.value    = cust.license;
    if (addrEl   && !addrEl.value)   addrEl.value   = cust.address || "";
  });
})();

/* ---- CC form: auto-fill holder name from selected customer ---- */
(function initCcCustomerLink() {
  const sel = $("#ccCustomer");
  if (!sel) return;
  sel.addEventListener("change", () => {
    const cust = state.customers.find(c => c.id === sel.value);
    if (!cust) return;
    const holderEl = $("#ccHolderName");
    if (holderEl && !holderEl.value) holderEl.value = `${cust.first} ${cust.last}`.trim();
  });
})();

$("#btnResetAll") && $("#btnResetAll").addEventListener("click", () => {
  if (!confirm("Reset ALL data? This cannot be undone.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  selectedInvoiceTxId = null;
  toast("All data reset.");
  rerenderAll();
});

$("#btnBackup") && $("#btnBackup").addEventListener("click", () => downloadJson(state, "mt-dms-backup.json"));

$("#backupFile") && $("#backupFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const parsed = safeJsonParse(await file.text());
    if (!parsed) throw new Error("Invalid JSON backup.");
    state = parsed;
    saveState();
    toast("Backup restored.");
    rerenderAll();
  } catch (err) {
    toast(err.message || "Restore failed.");
  } finally {
    e.target.value = "";
  }
});

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function loadDemoData() {
  // Reset state before loading fresh demo data
  state.transactions = [];
  state.invoices    = {};

  // ── Vehicles ──
  // Stock = desired final count + number of demo purchases against this VIN
  state.vehicles = [
    { id: uid("veh"), vin: "JH4KA7650MC000001", make: "Porsche",    model: "911 Carrera",        year: 2023, category: "sport",        condition: "new",      mileage: 0,      price: 112000, stock: 2  }, // tx1 → final 1
    { id: uid("veh"), vin: "1HGCM82633A000002", make: "Honda",      model: "Accord EX",          year: 2022, category: "family",       condition: "used",     mileage: 28400,  price: 24500,  stock: 5  }, // tx2+tx11 → final 3
    { id: uid("veh"), vin: "2T1BURHE0JC000003", make: "Toyota",     model: "GR Supra",           year: 2024, category: "sport",        condition: "new",      mileage: 0,      price: 57000,  stock: 5  }, // tx10+tx14+tx18 → final 2
    { id: uid("veh"), vin: "WBS8M9C50J5J00004", make: "BMW",        model: "M3 Competition",     year: 2021, category: "sport",        condition: "used",     mileage: 14200,  price: 58900,  stock: 2  }, // tx3 → final 1
    { id: uid("veh"), vin: "1G1FB1RX5J0000005", make: "Chevrolet",  model: "Corvette Z06",       year: 2024, category: "sport",        condition: "new",      mileage: 0,      price: 89500,  stock: 1  }, // no sales
    { id: uid("veh"), vin: "5YJSA1E26MF000006", make: "Tesla",      model: "Model S Plaid",      year: 2022, category: "family",       condition: "used",     mileage: 19800,  price: 71000,  stock: 3  }, // tx5 → final 2
    { id: uid("veh"), vin: "3VWF17AT1DM000007", make: "Volkswagen", model: "Golf GTI",           year: 2020, category: "sport",        condition: "trade-in", mileage: 44100,  price: 18200,  stock: 3  }, // tx12+tx20 → final 1
    { id: uid("veh"), vin: "2HKRM4H73FH000008", make: "Honda",      model: "CR-V Sport",         year: 2023, category: "family",       condition: "new",      mileage: 0,      price: 36400,  stock: 7  }, // tx6+tx9+tx13 → final 4
    { id: uid("veh"), vin: "1FM5K8GC1LGB00009", make: "Ford",       model: "Explorer XLT",       year: 2023, category: "family",       condition: "used",     mileage: 22000,  price: 38700,  stock: 4  }, // tx8+tx16 → final 2
    { id: uid("veh"), vin: "WDDUG8CB4EA000010", make: "Mercedes",   model: "S-Class",            year: 2022, category: "family",       condition: "used",     mileage: 18500,  price: 94000,  stock: 2  }, // tx4 → final 1
    { id: uid("veh"), vin: "JN1AZ4EH4FM000011", make: "Nissan",     model: "GT-R Premium",       year: 2021, category: "sport",        condition: "used",     mileage: 9800,   price: 98500,  stock: 2  }, // tx7 → final 1
    { id: uid("veh"), vin: "1FADP3F27EL000012", make: "Ford",       model: "Focus ST",           year: 2023, category: "sport",        condition: "new",      mileage: 0,      price: 31200,  stock: 3  }, // no sales
    { id: uid("veh"), vin: "2C3CCAGG4FH000013", make: "Dodge",      model: "Challenger RT",      year: 2022, category: "sport",        condition: "used",     mileage: 31000,  price: 32400,  stock: 2  }, // tx19 → final 1
    { id: uid("veh"), vin: "KNDJN2A24G7000014", make: "Kia",        model: "Soul LX",            year: 2023, category: "recreational", condition: "new",      mileage: 0,      price: 22100,  stock: 7  }, // tx15+tx17 → final 5
    { id: uid("veh"), vin: "3CZRU6H52KM000015", make: "Honda",      model: "HR-V Sport",         year: 2022, category: "recreational", condition: "used",     mileage: 16400,  price: 24800,  stock: 2  }, // no sales
  ];

  // ── Customers ──
  state.customers = [
    // Friends
    { id: uid("cust"), first: "Ross",      middle: "", last: "Geller",       address: "15 Grove St, New York, NY",               phone1: "+1 212 555 0181", phone2: "", license: "NY8821456", creditScore: 720, txHistory: [] },
    { id: uid("cust"), first: "Monica",    middle: "", last: "Geller",       address: "90 Bedford St, New York, NY",             phone1: "+1 212 555 0182", phone2: "", license: "NY8821457", creditScore: 780, txHistory: [] },
    { id: uid("cust"), first: "Chandler",  middle: "", last: "Bing",         address: "14 Yemen Rd, New York, NY",               phone1: "+1 212 555 0183", phone2: "", license: "NY8821458", creditScore: 695, txHistory: [] },
    { id: uid("cust"), first: "Joey",      middle: "", last: "Tribbiani",    address: "90 Bedford St Apt 19, New York, NY",      phone1: "+1 212 555 0184", phone2: "", license: "NY8821459", creditScore: 520, txHistory: [] },
    { id: uid("cust"), first: "Rachel",    middle: "", last: "Green",        address: "495 Grove St, New York, NY",              phone1: "+1 212 555 0185", phone2: "", license: "NY8821460", creditScore: 760, txHistory: [] },
    { id: uid("cust"), first: "Phoebe",    middle: "", last: "Buffay",       address: "5 Morton St, New York, NY",               phone1: "+1 212 555 0186", phone2: "", license: "NY8821461", creditScore: 610, txHistory: [] },
    // HIMYM
    { id: uid("cust"), first: "Barney",    middle: "", last: "Stinson",      address: "GNB Tower, New York, NY",                 phone1: "+1 212 555 0199", phone2: "", license: "NY9934521", creditScore: 810, txHistory: [] },
    { id: uid("cust"), first: "Marshall",  middle: "", last: "Eriksen",      address: "2030 Maple Ave, St Paul, MN",             phone1: "+1 651 555 0143", phone2: "", license: "MN4421301", creditScore: 695, txHistory: [] },
    { id: uid("cust"), first: "Lily",      middle: "", last: "Aldrin",       address: "2030 Maple Ave, St Paul, MN",             phone1: "+1 651 555 0144", phone2: "", license: "MN4421302", creditScore: 710, txHistory: [] },
    { id: uid("cust"), first: "Ted",       middle: "", last: "Mosby",        address: "214 W 82nd St, New York, NY",             phone1: "+1 614 555 0101", phone2: "", license: "OH5531201", creditScore: 680, txHistory: [] },
    { id: uid("cust"), first: "Robin",     middle: "", last: "Scherbatsky",  address: "870 5th Ave, New York, NY",               phone1: "+1 604 555 0177", phone2: "", license: "CA7712301", creditScore: 735, txHistory: [] },
    // One Piece
    { id: uid("cust"), first: "Monkey D.", middle: "", last: "Luffy",        address: "1 Thousand Sunny Blvd, Los Angeles, CA", phone1: "+1 310 555 0177", phone2: "", license: "EG0000001", creditScore: 540, txHistory: [] },
    { id: uid("cust"), first: "Roronoa",   middle: "", last: "Zoro",         address: "Dojo District, East Blue, CA",            phone1: "+1 310 555 0178", phone2: "", license: "EG0000002", creditScore: 640, txHistory: [] },
    { id: uid("cust"), first: "Nami",      middle: "", last: "",             address: "88 Tangerine Grove, Cocoyasi, CA",        phone1: "+1 310 555 0179", phone2: "", license: "EG0000003", creditScore: 750, txHistory: [] },
    { id: uid("cust"), first: "Usopp",     middle: "", last: "",             address: "1 Syrup Village Rd, Los Angeles, CA",     phone1: "+1 310 555 0180", phone2: "", license: "EG0000004", creditScore: 490, txHistory: [] },
    { id: uid("cust"), first: "Sanji",     middle: "", last: "",             address: "Baratie Restaurant, Los Angeles, CA",     phone1: "+1 310 555 0181", phone2: "", license: "EG0000005", creditScore: 700, txHistory: [] },
    { id: uid("cust"), first: "Nico",      middle: "", last: "Robin",        address: "Ohara Archives Ln, Los Angeles, CA",      phone1: "+1 310 555 0182", phone2: "", license: "EG0000006", creditScore: 770, txHistory: [] },
    { id: uid("cust"), first: "Franky",    middle: "", last: "",             address: "Shipyard Blvd, Water 7, CA",              phone1: "+1 310 555 0183", phone2: "", license: "WG0000007", creditScore: 620, txHistory: [] },
    // JJK
    { id: uid("cust"), first: "Yuji",      middle: "", last: "Itadori",      address: "Jujutsu High, Tokyo Block, SF, CA",       phone1: "+1 415 555 0122", phone2: "", license: "TK1100001", creditScore: 590, txHistory: [] },
    { id: uid("cust"), first: "Megumi",    middle: "", last: "Fushiguro",    address: "Zenin Estate Dr, SF, CA",                 phone1: "+1 415 555 0123", phone2: "", license: "TK1100002", creditScore: 670, txHistory: [] },
    { id: uid("cust"), first: "Nobara",    middle: "", last: "Kugisaki",     address: "Harajuku Ave, SF, CA",                    phone1: "+1 415 555 0124", phone2: "", license: "TK1100003", creditScore: 610, txHistory: [] },
    { id: uid("cust"), first: "Satoru",    middle: "", last: "Gojo",         address: "Infinity Tower, SF, CA",                  phone1: "+1 415 555 0125", phone2: "", license: "TK1100004", creditScore: 850, txHistory: [] },
    { id: uid("cust"), first: "Suguru",    middle: "", last: "Geto",         address: "Occult Circle, SF, CA",                   phone1: "+1 415 555 0126", phone2: "", license: "TK1100005", creditScore: 730, txHistory: [] },
    // Naruto
    { id: uid("cust"), first: "Naruto",    middle: "", last: "Uzumaki",      address: "1 Hokage Rock Rd, Portland, OR",          phone1: "+1 503 555 0001", phone2: "", license: "KN0000001", creditScore: 580, txHistory: [] },
    { id: uid("cust"), first: "Sasuke",    middle: "", last: "Uchiha",       address: "Uchiha District, Portland, OR",           phone1: "+1 503 555 0002", phone2: "", license: "KN0000002", creditScore: 720, txHistory: [] },
    { id: uid("cust"), first: "Sakura",    middle: "", last: "Haruno",       address: "7 Medical Ninja Way, Portland, OR",       phone1: "+1 503 555 0003", phone2: "", license: "KN0000003", creditScore: 690, txHistory: [] },
    // Attack on Titan
    { id: uid("cust"), first: "Eren",      middle: "", last: "Yeager",       address: "Wall Maria St, Seattle, WA",              phone1: "+1 206 555 0001", phone2: "", license: "PM0000001", creditScore: 550, txHistory: [] },
    { id: uid("cust"), first: "Mikasa",    middle: "", last: "Ackerman",     address: "Scout Regiment Ave, Seattle, WA",         phone1: "+1 206 555 0002", phone2: "", license: "PM0000002", creditScore: 740, txHistory: [] },
    { id: uid("cust"), first: "Armin",     middle: "", last: "Arlert",       address: "104th Corps Blvd, Seattle, WA",           phone1: "+1 206 555 0003", phone2: "", license: "PM0000003", creditScore: 700, txHistory: [] },
    { id: uid("cust"), first: "Levi",      middle: "", last: "Ackerman",     address: "1 Special Ops Tower, Seattle, WA",        phone1: "+1 206 555 0004", phone2: "", license: "PM0000004", creditScore: 800, txHistory: [] },
  ];

  state.settings = { discountRule: { ...DEFAULT_DISCOUNT_RULE } };

  // Helper: find customer ID by license number
  const cId = (lic) => state.customers.find(c => c.license === lic)?.id;

  // ── Transactions ── spread Sept 2025 → Mar 2026 for chart data
  const demoTxs = [
    // Sep 2025
    { type: "purchase", date: "2025-09-04", customerId: cId("NY9934521"), salesperson: "ted_mosby",    vehicleVinBuy: "JH4KA7650MC000001", priceOverrideUSD: 112000, tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2025-09-18", customerId: cId("NY8821456"), salesperson: "rachel_green", vehicleVinBuy: "1HGCM82633A000002", priceOverrideUSD: 23800,  tradeInValueUSD: 0,     tradeIn: null },
    // Oct 2025
    { type: "purchase", date: "2025-10-02", customerId: cId("PM0000004"), salesperson: "chandler_bing",vehicleVinBuy: "WBS8M9C50J5J00004", priceOverrideUSD: 58900,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2025-10-15", customerId: cId("TK1100004"), salesperson: "ted_mosby",    vehicleVinBuy: "WDDUG8CB4EA000010", priceOverrideUSD: 94000,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2025-10-28", customerId: cId("PM0000002"), salesperson: "rachel_green", vehicleVinBuy: "5YJSA1E26MF000006", priceOverrideUSD: 71000,  tradeInValueUSD: 0,     tradeIn: null },
    // Nov 2025
    { type: "purchase", date: "2025-11-05", customerId: cId("CA7712301"), salesperson: "chandler_bing",vehicleVinBuy: "2HKRM4H73FH000008", priceOverrideUSD: 35900,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2025-11-14", customerId: cId("KN0000002"), salesperson: "ted_mosby",    vehicleVinBuy: "JN1AZ4EH4FM000011", priceOverrideUSD: 98500,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2025-11-22", customerId: cId("EG0000006"), salesperson: "rachel_green", vehicleVinBuy: "1FM5K8GC1LGB00009", priceOverrideUSD: 37200,  tradeInValueUSD: 0,     tradeIn: null },
    // Dec 2025
    { type: "purchase", date: "2025-12-03", customerId: cId("MN4421301"), salesperson: "chandler_bing",vehicleVinBuy: "2HKRM4H73FH000008", priceOverrideUSD: 36000,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "tradein",  date: "2025-12-11", customerId: cId("KN0000001"), salesperson: "ted_mosby",    vehicleVinBuy: "2T1BURHE0JC000003", priceOverrideUSD: 57000,  tradeInValueUSD: 12000,
      tradeIn: { make: "Jeep", model: "Wrangler", year: 2016, mileage: 88000, estimatedResaleUSD: 12000 } },
    { type: "purchase", date: "2025-12-19", customerId: cId("EG0000003"), salesperson: "rachel_green", vehicleVinBuy: "1HGCM82633A000002", priceOverrideUSD: 24200,  tradeInValueUSD: 0,     tradeIn: null },
    // Jan 2026
    { type: "purchase", date: "2026-01-07", customerId: cId("TK1100002"), salesperson: "chandler_bing",vehicleVinBuy: "3VWF17AT1DM000007", priceOverrideUSD: 17500,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2026-01-15", customerId: cId("NY8821457"), salesperson: "rachel_green", vehicleVinBuy: "2HKRM4H73FH000008", priceOverrideUSD: 35900,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2026-01-24", customerId: cId("EG0000005"), salesperson: "ted_mosby",    vehicleVinBuy: "2T1BURHE0JC000003", priceOverrideUSD: 55500,  tradeInValueUSD: 0,     tradeIn: null },
    // Feb 2026
    { type: "tradein",  date: "2026-02-03", customerId: cId("PM0000003"), salesperson: "chandler_bing",vehicleVinBuy: "KNDJN2A24G7000014", priceOverrideUSD: 22100,  tradeInValueUSD: 5500,
      tradeIn: { make: "Toyota", model: "Corolla", year: 2014, mileage: 74000, estimatedResaleUSD: 5500 } },
    { type: "purchase", date: "2026-02-12", customerId: cId("MN4421302"), salesperson: "rachel_green", vehicleVinBuy: "1FM5K8GC1LGB00009", priceOverrideUSD: 38200,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2026-02-20", customerId: cId("EG0000004"), salesperson: "chandler_bing",vehicleVinBuy: "KNDJN2A24G7000014", priceOverrideUSD: 21500,  tradeInValueUSD: 0,     tradeIn: null },
    // Mar 2026
    { type: "tradein",  date: "2026-03-10", customerId: cId("TK1100001"), salesperson: "ted_mosby",    vehicleVinBuy: "2T1BURHE0JC000003", priceOverrideUSD: 57000,  tradeInValueUSD: 9500,
      tradeIn: { make: "Dodge", model: "Charger", year: 2018, mileage: 62000, estimatedResaleUSD: 9500 } },
    { type: "purchase", date: "2026-03-14", customerId: cId("NY8821457"), salesperson: "rachel_green", vehicleVinBuy: "2C3CCAGG4FH000013", priceOverrideUSD: 31900,  tradeInValueUSD: 0,     tradeIn: null },
    { type: "purchase", date: "2026-03-15", customerId: cId("EG0000001"), salesperson: "ted_mosby",    vehicleVinBuy: "3VWF17AT1DM000007", priceOverrideUSD: 17500,  tradeInValueUSD: 0,     tradeIn: null },
  ];

  for (const txInput of demoTxs) {
    try { createTransaction(txInput); }
    catch (e) { console.warn("Demo tx skipped:", e.message); }
  }

  saveState();
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Page reveal — called after all rendering is done
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function revealPage() {
  const content = document.querySelector('.content');
  if (!content) return;
  content.style.transition = 'opacity 280ms cubic-bezier(0.16,1,0.3,1), transform 280ms cubic-bezier(0.16,1,0.3,1)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    content.style.opacity = '1';
    content.style.transform = 'translateY(0)';
  }));
}

/* ---- Boot ---- */

if (!window.location.pathname.endsWith("login.html")) requireAuth();
setSessionBadge();

// Restore sidebar scroll before rendering
const _sidebarEl = document.querySelector('.sidebar');
if (_sidebarEl) {
  const _savedScroll = sessionStorage.getItem('sidebar_scroll');
  if (_savedScroll) { _sidebarEl.scrollTop = Number(_savedScroll); sessionStorage.removeItem('sidebar_scroll'); }
}

rerenderAll();

// Pre-populate employee form from ?edit= URL param on register-employee.html
(function() {
  var params = new URLSearchParams(location.search);
  var editId = params.get("edit");
  if (!editId || !$("#employeeForm")) return;
  var emp = state && state.employees && state.employees.find(function(x) { return x.id === editId; });
  if (!emp) return;
  if ($("#employeeId"))    $("#employeeId").value = emp.id;
  if ($("#empName"))       $("#empName").value = emp.name;
  if ($("#empUsername"))   $("#empUsername").value = emp.username;
  if ($("#empRole"))       $("#empRole").value = emp.role;
  if ($("#empDepartment")) $("#empDepartment").value = emp.department || "";
})();

// Staggered stat card entrance when arriving from login
if (sessionStorage.getItem('mt_from_login') === '1') {
  sessionStorage.removeItem('mt_from_login');
  document.querySelectorAll('.stat-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = `opacity 350ms cubic-bezier(0.16,1,0.3,1) ${i * 90}ms, transform 350ms cubic-bezier(0.16,1,0.3,1) ${i * 90}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }));
  });
}

revealPage();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Theme toggle — light-first, html.dark for dark mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function syncThemeIcon() {
  const btn = document.getElementById("btnTheme");
  if (!btn) return;
  const isDark = document.documentElement.classList.contains("dark");
  // Sun = currently dark (click to go light), Moon = currently light (click to go dark)
  btn.innerHTML = isDark
    ? `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7.5" cy="7.5" r="2.5"/><path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3.05 3.05l1.06 1.06M10.89 10.89l1.06 1.06M3.05 11.95l1.06-1.06M10.89 4.11l1.06-1.06"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 7.5a5.5 5.5 0 0 0 9.9 3.28A5.5 5.5 0 0 1 6.22 1.1 5.5 5.5 0 0 0 2 7.5z"/></svg>`;
}

(function initTheme() {
  const root = document.documentElement;

  // Remove notransition after full page load — prevents theme-flash on first paint
  window.addEventListener('load', () => { document.documentElement.classList.remove('notransition'); });

  syncThemeIcon();

  const btnTheme = document.getElementById("btnTheme");
  if (btnTheme) {
    btnTheme.addEventListener("click", () => {
      const isDarkNow = root.classList.toggle("dark");
      localStorage.setItem("mt_theme", isDarkNow ? "dark" : "light");
      syncThemeIcon();
      const utilToggle = document.getElementById("utilDarkToggle");
      if (utilToggle) utilToggle.checked = isDarkNow;
    });
  }
})();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Page transitions — smooth SPA-style nav
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function initTransitions() {
  // Fade out on nav-item click, then navigate (skip if already on page)
  document.querySelectorAll('a.nav-item').forEach(link => {
    link.addEventListener('click', function (e) {
      if (this.classList.contains('active')) return;
      const href = this.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || this.target === '_blank') return;
      e.preventDefault();
      // Persist sidebar scroll position for restore on next page
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sessionStorage.setItem('sidebar_scroll', sidebar.scrollTop);
      const content = document.querySelector('.content');
      if (content) {
        content.style.opacity = '0';
        content.style.transform = 'translateY(-6px)';
        content.style.transition = 'opacity 160ms ease, transform 160ms ease';
        setTimeout(() => { window.location.href = href; }, 165);
      } else {
        window.location.href = href;
      }
    });
  });
})();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Auth page — tab switching
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function initAuthTabs() {
  const tabs   = document.querySelectorAll(".auth-tab");
  const panels = document.querySelectorAll(".auth-panel");
  if (!tabs.length) return;

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      panels.forEach(p => { p.hidden = true; });

      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      const target = document.getElementById(tab.dataset.panel);
      if (target) target.hidden = false;
    });
  });
})();

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Register form (demo)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
$("#registerForm") && $("#registerForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const username = $("#regUser").value.trim();
  const pass     = $("#regPass").value;
  const confirm  = $("#regPassConfirm").value;
  const role     = $("#regRole").value;

  if (!username) {
    toast("Username is required.");
    return;
  }
  if (pass !== confirm) {
    toast("Passwords don't match.");
    return;
  }
  if (pass !== "demo") {
    toast("Demo password must be 'demo'.");
    return;
  }

  if (login(username, pass, role)) {
    toast(`Account created. Signed in as ${username} (${role}).`);
    window.location.href = "dashboard.html";
  }
});
