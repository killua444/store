const SETTINGS_URL = 'content/settings.json';
const PRODUCTS_URL = 'products.json';

const STORAGE_KEYS = {
  cart: 'shadowwear:cart',
  promo: 'shadowwear:promo',
  theme: 'shadowwear:theme'
};

const state = {
  products: [],
  cart: [],
  promo: null,
  settings: null,
  adminMode: 'name',
  activeCategory: 'all',
  searchTerm: ''
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const formatMAD = (n) => `MAD ${Number(n).toFixed(2)}`;

const baseUrl = () =>
  window.location.origin + window.location.pathname.replace(/index\.html?$/, '');

const productUrl = (product) => `${baseUrl()}#product/${product.id}`;

const waUrl = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

const buildProductShareMessage = (product) =>
  [
    `🛍️ *${product.title}*`,
    `ID: ${product.id}`,
    `Price: ${formatMAD(product.price)}`,
    `Image: ${product.image}`,
    `Link: ${productUrl(product)}`
  ].join('\n');

const buildOrderMessage = ({ customer, items, totals, promo }) => {
  const lines = [];
  lines.push('🧾 *Order Summary*');
  if (customer) {
    lines.push(`👤 ${customer.name || ''} | 📞 ${customer.phone || ''}`);
    lines.push(`🏙️ ${customer.city || ''} | 📦 ${customer.address || ''}`);
    if (customer.note) lines.push(`📝 ${customer.note}`);
  }
  lines.push('\n*Items:*');
  for (const item of items) {
    lines.push(`• ${item.title} (ID: ${item.id})`);
    lines.push(
      `  - ${item.color ? `Color: ${item.color} | ` : ''}${item.size ? `Size: ${item.size} | ` : ''}Qty: ${item.qty}`
    );
    lines.push(`  - Unit: ${formatMAD(item.price)} | Line: ${formatMAD(item.price * item.qty)}`);
    if (item.image) lines.push(`  - Image: ${item.image}`);
  }
  lines.push(`\nSubtotal: ${formatMAD(totals.subtotal)}`);
  lines.push(`Shipping: ${formatMAD(totals.shipping)}`);
  if (promo?.code) lines.push(`Promo: ${promo.code}`);
  lines.push(`*Total: ${formatMAD(totals.total)}*`);
  return lines.join('\n');
};

const calcTotals = () => {
  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shippingFlat = state.settings?.shippingFlatMAD ?? 30;
  const freeThreshold = state.settings?.freeShippingThresholdMAD ?? 500;
  const shipping = subtotal >= freeThreshold ? 0 : shippingFlat;
  let total = subtotal + shipping;
  if (state.promo?.type === 'percent') {
    total = total * (1 - state.promo.value / 100);
  }
  return { subtotal, shipping, total };
};

const saveCartState = () => {
  localStorage.setItem(
    STORAGE_KEYS.cart,
    JSON.stringify({ cart: state.cart, promo: state.promo })
  );
};

const loadCartState = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart));
    if (stored) {
      state.cart = stored.cart || [];
      state.promo = stored.promo || null;
    }
  } catch {
    // ignore parse errors
  }
};

const saveTheme = (theme) => localStorage.setItem(STORAGE_KEYS.theme, theme);
const loadTheme = () => localStorage.getItem(STORAGE_KEYS.theme);

const openWhatsApp = (message, phone) => {
  const targetPhone = phone || state.settings?.ownerPhoneE164 || '212696952145';
  const url = waUrl(targetPhone, message);
  const win = window.open(url, '_blank');
  if (!win) {
    alert(`Popup blocked. Open manually:\n${url}`);
  }
};

let toastTimer;
const showToast = (msg) => {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
};

const copyText = (text) => {
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast('Copied!'))
      .catch(() => alert(text));
  } else {
    alert(text);
  }
};

const adminCommand = (product) => `/PRODUCT id=${product.id} name="${product.title}" price=${product.price}`;

const filterProducts = () => {
  const category = state.activeCategory;
  const term = state.searchTerm.trim().toLowerCase();
  return state.products.filter((product) => {
    const matchesCategory =
      category === 'all' ||
      (product.category || '').toLowerCase() === category.toLowerCase();
    const matchesSearch =
      !term ||
      product.title.toLowerCase().includes(term) ||
      (product.brand || '').toLowerCase().includes(term) ||
      (product.id || '').toLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  });
};

const renderProducts = () => {
  const grid = $('#productsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const list = filterProducts();
  list.forEach((product) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-media">
        <img src="${product.image}" alt="${product.title}" loading="lazy">
      </div>
      <div class="card-body">
        <span class="card-sub">${product.category || ''}</span>
        <h3 class="card-title">${product.title}</h3>
        <div class="card-row">
          <span class="price">${formatMAD(product.price)}</span>
          <div style="display:flex; gap:.4rem;">
            <button class="share-mini" type="button" aria-label="Share product">⤴︎</button>
            <button class="btn-mini" type="button" aria-label="Add product to cart">＋</button>
          </div>
        </div>
      </div>
    `;
    const addBtn = card.querySelector('.btn-mini');
    const shareBtn = card.querySelector('.share-mini');
    addBtn.addEventListener('click', () => addToCart(product));
    shareBtn.addEventListener('click', () => openWhatsApp(buildProductShareMessage(product)));
    grid.appendChild(card);
  });
};

const renderCart = () => {
  const container = $('#cartItems');
  if (!container) return;
  container.innerHTML = '';
  state.cart.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div style="display:flex; gap:.6rem; align-items:center;">
        <img src="${item.image}" alt="${item.title}" style="width:64px;height:64px;object-fit:cover;border-radius:12px;">
        <div>
          <div style="font-weight:700;">${item.title}</div>
          <div style="color:var(--muted);font-size:.9em;">ID: ${item.id}</div>
          <div>${formatMAD(item.price)}</div>
        </div>
      </div>
      <div style="display:flex; gap:.4rem; align-items:center; justify-content:flex-end;">
        <button class="copy-btn" type="button" aria-label="Decrease quantity">−</button>
        <span>${item.qty}</span>
        <button class="copy-btn" type="button" aria-label="Increase quantity">＋</button>
        <button class="copy-btn" type="button" aria-label="Remove item">🗑</button>
      </div>
    `;
    const [minusBtn, , plusBtn, removeBtn] = row.querySelectorAll('button');
    minusBtn.addEventListener('click', () => changeQty(index, -1));
    plusBtn.addEventListener('click', () => changeQty(index, 1));
    removeBtn.addEventListener('click', () => removeFromCart(index));
    container.appendChild(row);
  });

  const totals = calcTotals();
  $('#subtotalVal').textContent = formatMAD(totals.subtotal);
  $('#shippingVal').textContent = formatMAD(totals.shipping);
  $('#totalVal').textContent = formatMAD(totals.total);
  $('#cartCount').textContent = String(state.cart.reduce((sum, item) => sum + item.qty, 0));
};

const renderAdmin = (list) => {
  const root = $('#adminResults');
  if (!root) return;
  root.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'admin-row admin-header';
  header.innerHTML = '<div></div><div>Title</div><div>ID</div><div>Price</div><div>Actions</div>';
  root.appendChild(header);

  list.forEach((product) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <img src="${product.image}" alt="${product.title}">
      <div>${product.title}</div>
      <div>${product.id}</div>
      <div>${formatMAD(product.price)}</div>
      <div style="display:flex;gap:.5rem;">
        <button class="copy-btn" type="button">Copy ID</button>
        <button class="admin-wa-btn" type="button">Admin WA</button>
      </div>
    `;
    row.querySelector('.copy-btn').addEventListener('click', () => copyText(product.id));
    row
      .querySelector('.admin-wa-btn')
      .addEventListener('click', () => openWhatsApp(adminCommand(product)));
    root.appendChild(row);
  });
};

const addToCart = (product) => {
  const existing = state.cart.find((item) => item.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      qty: 1
    });
  }
  showToast('Added to cart');
  saveCartState();
  renderCart();
};

const changeQty = (index, delta) => {
  state.cart[index].qty += delta;
  if (state.cart[index].qty <= 0) {
    state.cart.splice(index, 1);
  }
  saveCartState();
  renderCart();
};

const removeFromCart = (index) => {
  state.cart.splice(index, 1);
  saveCartState();
  renderCart();
};

const applyPromo = (code) => {
  const trimmed = code.trim();
  if (!trimmed) {
    showToast('Enter a promo code');
    return;
  }
  const match = state.settings?.promoCodes?.find(
    (promo) => promo.code.toLowerCase() === trimmed.toLowerCase()
  );
  if (!match) {
    state.promo = null;
    showToast('Invalid promo');
  } else {
    state.promo = match;
    showToast(`Promo applied: ${match.code}`);
  }
  saveCartState();
  renderCart();
};

const filterAdmin = (query, mode) => {
  const value = (query || '').trim().toLowerCase();
  if (!value) return state.products;
  if (mode === 'id') {
    return state.products.filter((p) => (p.id || '').toLowerCase().includes(value));
  }
  return state.products.filter((p) => p.title.toLowerCase().includes(value));
};

const checkAdminAuth = () => {
  if (location.hash === '#admin') {
    const stored = localStorage.getItem('admin-pass');
    if (stored !== 'shadow2002@') {
      const input = prompt('Enter admin password:');
      if (input === 'shadow2002@') {
        localStorage.setItem('admin-pass', input);
        showToast('Access granted');
      } else {
        alert('Incorrect password');
        location.hash = '#';
        return false;
      }
    }
  }
  return true;
};

const updateRoute = () => {
  const isAdmin = location.hash === '#admin';
  if (isAdmin && !checkAdminAuth()) return;
  $('#adminView').hidden = !isAdmin;
  const main = document.querySelector('main');
  if (main) main.style.display = isAdmin ? 'none' : '';
  if (isAdmin) {
    renderAdmin(filterAdmin($('#adminSearch').value, state.adminMode));
  }
};

window.addEventListener('hashchange', updateRoute);

const initTheme = () => {
  const html = document.documentElement;
  const saved = loadTheme();
  if (saved) {
    html.setAttribute('data-theme', saved);
  }
  $('#themeToggle')?.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    if (current === 'light') {
      html.removeAttribute('data-theme');
      saveTheme('');
    } else {
      html.setAttribute('data-theme', 'light');
      saveTheme('light');
    }
  });
};

const init = async () => {
  loadCartState();
  $('#year').textContent = new Date().getFullYear();
  initTheme();
  updateRoute();

  const backdrop = $('#drawerBackdrop');
  const cartDrawer = $('#cartDrawer');

  const openDrawer = () => {
    cartDrawer.classList.add('open');
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('show'));
  };

  const closeDrawer = () => {
    cartDrawer.classList.remove('open');
    backdrop.classList.remove('show');
    setTimeout(() => (backdrop.hidden = true), 220);
  };

  $('#openCart').addEventListener('click', openDrawer);
  $('#closeCart').addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
  });

  const [settingsRes, productsRes] = await Promise.all([
    fetch(SETTINGS_URL),
    fetch(PRODUCTS_URL)
  ]);
  state.settings = await settingsRes.json();
  const data = await productsRes.json();
  state.products = data.products || [];

  renderProducts();
  renderCart();

  $$('#filters .pill').forEach((btn) =>
    btn.addEventListener('click', (event) => {
      $$('#filters .pill').forEach((pill) => pill.classList.remove('active'));
      const target = event.currentTarget;
      target.classList.add('active');
      state.activeCategory = target.dataset.filter || 'all';
      renderProducts();
    })
  );

  let searchTimer;
  $('#searchInput').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchTerm = event.target.value;
      renderProducts();
    }, 300);
  });

  $('#applyPromo').addEventListener('click', () => applyPromo($('#promoInput').value));

  $('#checkoutWhatsApp').addEventListener('click', () => {
    if (!state.cart.length) {
      showToast('Cart is empty');
      return;
    }
    const customer = {
      name: $('#custName').value,
      phone: $('#custPhone').value,
      city: $('#custCity').value,
      address: $('#custAddress').value,
      note: $('#custNote').value
    };
    const totals = calcTotals();
    const message = buildOrderMessage({
      customer,
      items: state.cart,
      totals,
      promo: state.promo
    });
    openWhatsApp(message);
  });

  $('#adminSearch').addEventListener('input', (event) =>
    renderAdmin(filterAdmin(event.target.value, state.adminMode))
  );

  $$('input[name="mode"]').forEach((radio) =>
    radio.addEventListener('change', (event) => {
      state.adminMode = event.target.value;
      renderAdmin(filterAdmin($('#adminSearch').value, state.adminMode));
    })
  );

  $('#adminLogout').addEventListener('click', () => {
    localStorage.removeItem('admin-pass');
    showToast('Logged out');
    location.hash = '#';
  });

  document.addEventListener('click', (event) => {
    const cta = event.target.closest('.cta');
    if (cta) {
      event.preventDefault();
      document.querySelector('#popular')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  renderAdmin(state.products);
  updateRoute();
};

document.addEventListener('DOMContentLoaded', init);
