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
      settings: { discountRule: { ...DEFAULT_DISCOUNT_RULE } }
    };
  }
  return {
    session: parsed.session ?? null,
    vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    invoices: parsed.invoices ?? {},
    settings: parsed.settings ?? { discountRule: { ...DEFAULT_DISCOUNT_RULE } }
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

function setSessionBadge() {
  const badge = $("#sessionBadge");
  const btn = $("#btnLogout");
  if (!badge || !btn) return;

  if (state.session) {
    badge.textContent = `Signed in: ${state.session.username} (${state.session.role})`;
    btn.hidden = false;
  } else {
    badge.textContent = "Not signed in";
    btn.hidden = true;
  }
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

function renderSettings() {
  const rule = state.settings.discountRule ?? DEFAULT_DISCOUNT_RULE;
  const t = $("#discountThreshold");
  const p = $("#discountPerk");
  if (t && document.activeElement !== t) t.value = rule.thresholdUSD;
  if (p && document.activeElement !== p) p.value = rule.perkText;
}

function rerenderAll() {
  setSessionBadge();
  renderDashboard();
  renderInventory();
  renderCustomers();
  refreshTransactionSelects();
  renderTransactions();
  renderReports();
  renderSearch();
  renderSettings();
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
  window.location.href = "dashboard.html";
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

$("#customerForm") && $("#customerForm").addEventListener("submit", (e) => {
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

$("#customerList") && $("#customerList").addEventListener("click", (e) => {
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

$("#discountForm") && $("#discountForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.settings.discountRule = {
    thresholdUSD: Number($("#discountThreshold").value),
    perkText: $("#discountPerk").value.trim()
  };
  saveState();
  toast("Discount rule saved.");
  rerenderAll();
});

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
  state.vehicles = [
    { id: uid("veh"), vin: "VIN-TOY-2024-CAMRY", make: "Toyota", model: "Camry", year: 2024, category: "family", condition: "new", mileage: 0, price: 32000, stock: 3 },
    { id: uid("veh"), vin: "VIN-FRD-2021-MUSTANG", make: "Ford", model: "Mustang", year: 2021, category: "sport", condition: "used", mileage: 22000, price: 38000, stock: 1 },
    { id: uid("veh"), vin: "VIN-JEP-2020-WRANGLR", make: "Jeep", model: "Wrangler", year: 2020, category: "recreational", condition: "used", mileage: 41000, price: 36000, stock: 2 },
  ];

  state.customers = [
    { id: uid("cust"), first: "Amina", middle: "K", last: "Hassan", address: "123 Main St, Columbia, SC", phone1: "+1 555 111 2222", phone2: "", license: "DL1234567", creditScore: 720, txHistory: [] },
    { id: uid("cust"), first: "Zaid", middle: "", last: "Mohamed", address: "45 King Rd, Florence, SC", phone1: "+1 555 333 4444", phone2: "+1 555 444 5555", license: "DL7654321", creditScore: 690, txHistory: [] },
  ];

  state.transactions = [];
  state.invoices = {};
  state.settings = { discountRule: { ...DEFAULT_DISCOUNT_RULE } };
  saveState();
}

/* ---- Boot ---- */

if (!window.location.pathname.endsWith("login.html")) requireAuth();
setSessionBadge();
rerenderAll();
