const SETTINGS_URL = 'content/settings.json';
const PRODUCTS_URL = 'products.json';

const STORAGE_KEYS = {
  cart: 'shadowwear:cart',
  wishlist: 'shadowwear:wishlist',
  promo: 'shadowwear:promo',
  theme: 'shadowwear:theme',
  admin: 'shadowwear:admin-pass'
};

const state = {
  products: [],
  filtered: [],
  cart: [],
  wishlist: new Set(),
  promo: null,
  settings: null,
  activeCategory: 'all',
  searchTerm: '',
  theme: 'mint',
  adminMode: 'name',
  editingProductId: null,
  selectedProduct: null,
  sheetQty: 1,
  sheetColor: null,
  sheetSize: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const parseCsv = (value) =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const joinCsv = (arr) => (arr && arr.length ? arr.join(', ') : '');

const formatMAD = (n) => `MAD ${Number(n || 0).toFixed(2)}`;
const baseUrl = () => window.location.origin + window.location.pathname.replace(/index\.html?$/, '');
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
  const freeThreshold = state.settings?.freeShippingThresholdMAD ?? 500;
  const shippingFlat = state.settings?.shippingFlatMAD ?? 30;
  const shipping = subtotal >= freeThreshold ? 0 : shippingFlat;
  let total = subtotal + shipping;
  if (state.promo?.type === 'percent') {
    total = total * (1 - state.promo.value / 100);
  }
  return { subtotal, shipping, total };
};

let toastTimer;
const showToast = (message, type = 'info') => {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
};

const openWhatsApp = (text, phone) => {
  const number = phone || state.settings?.ownerPhoneE164 || '212696952145';
  const url = waUrl(number, text);
  const win = window.open(url, '_blank');
  if (!win) alert(`Popup blocked. Open manually:\n${url}`);
};

const copyText = (value) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(value).then(() => showToast('Copied!'), () => alert(value));
  } else {
    alert(value);
  }
};

const persistState = () => {
  localStorage.setItem(
    STORAGE_KEYS.cart,
    JSON.stringify({ cart: state.cart, promo: state.promo })
  );
  localStorage.setItem(STORAGE_KEYS.wishlist, JSON.stringify([...state.wishlist]));
  localStorage.setItem(STORAGE_KEYS.theme, state.theme);
};

const loadState = () => {
  try {
    const storedCart = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart));
    if (storedCart?.cart) state.cart = storedCart.cart;
    if (storedCart?.promo) state.promo = storedCart.promo;
  } catch {
    state.cart = [];
    state.promo = null;
  }

  try {
    const wish = JSON.parse(localStorage.getItem(STORAGE_KEYS.wishlist)) || [];
    state.wishlist = new Set(wish);
  } catch {
    state.wishlist = new Set();
  }

  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  if (savedTheme) state.theme = savedTheme;
};

const updateBadge = (selector, value) => {
  const badge = $(selector);
  if (badge) badge.textContent = String(value);
};

const filterProducts = () => {
  const term = state.searchTerm.trim().toLowerCase();
  state.filtered = state.products.filter((product) => {
    const matchesCategory =
      state.activeCategory === 'all' ||
      (product.category || '').toLowerCase() === state.activeCategory.toLowerCase();
    const matchesSearch =
      !term ||
      product.title.toLowerCase().includes(term) ||
      (product.brand || '').toLowerCase().includes(term) ||
      (product.id || '').toLowerCase().includes(term);
    return matchesCategory && matchesSearch;
  });
};

const renderProducts = () => {
  filterProducts();
  const grid = $('#productsGrid');
  grid.innerHTML = '';

  state.filtered.forEach((product) => {
    const card = document.createElement('article');
    const wished = state.wishlist.has(product.id);
    card.className = 'card';
    card.innerHTML = `
      <div class="card-media">
        <img src="${product.image}" alt="${product.title}" loading="lazy">
      </div>
      <div class="card-body">
        <span class="card-sub">${product.category || ''}</span>
        <h3 class="card-title">${product.title}</h3>
        <div class="card-meta">
          <span>⭐ ${product.rating ?? '4.8'}</span>
          <span>${product.sold ?? '1.2k'} sold</span>
        </div>
        <div class="card-row">
          <span class="price">${formatMAD(product.price)}</span>
          <div class="card-actions-inline">
            <button class="card-share" type="button" aria-label="Share product">⤴︎</button>
            <button class="card-wish ${wished ? 'is-active' : ''}" type="button" aria-label="Toggle wishlist">♡</button>
          </div>
        </div>
        <div class="card-actions">
          <button class="card-btn card-btn--cart" type="button">Add to cart</button>
          <button class="card-btn card-btn--quick" type="button">Quick view</button>
        </div>
      </div>
    `;
    card.querySelector('.card-btn--cart').addEventListener('click', () => {
      if (product.colors?.length || product.sizesEU?.length) {
        openProductSheet(product);
      } else {
        addToCart(product);
      }
    });
    card.querySelector('.card-btn--quick').addEventListener('click', () => openProductSheet(product));
    card.querySelector('.card-share').addEventListener('click', () => openWhatsApp(buildProductShareMessage(product)));
    card.querySelector('.card-wish').addEventListener('click', () => toggleWishlist(product.id));
    card.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      openProductSheet(product);
    });
    grid.appendChild(card);
  });
};

const renderCart = () => {
  const container = $('#cartItems');
  container.innerHTML = '';
  state.cart.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div style="display:flex; gap:.75rem; align-items:center;">
        <img src="${item.image}" alt="${item.title}" style="width:64px;height:64px;border-radius:12px;object-fit:cover;">
        <div>
          <div style="font-weight:700;">${item.title}</div>
          <div style="color:var(--muted);font-size:0.85rem;">ID: ${item.id}</div>
          <div style="color:var(--muted);font-size:0.85rem;">${item.color ? `Color ${item.color}` : ''} ${item.size ? `• Size ${item.size}` : ''}</div>
          <div>${formatMAD(item.price)}</div>
        </div>
      </div>
      <div style="display:flex; gap:.4rem; align-items:center;">
        <button class="copy-btn" type="button" aria-label="Decrease quantity">−</button>
        <span>${item.qty}</span>
        <button class="copy-btn" type="button" aria-label="Increase quantity">＋</button>
        <button class="copy-btn" type="button" aria-label="Remove item">🗑</button>
      </div>
    `;
    const [decBtn, , incBtn, removeBtn] = row.querySelectorAll('button');
    decBtn.addEventListener('click', () => changeQty(index, -1));
    incBtn.addEventListener('click', () => changeQty(index, 1));
    removeBtn.addEventListener('click', () => removeFromCart(index));
    container.appendChild(row);
  });
  const totals = calcTotals();
  $('#subtotalVal').textContent = formatMAD(totals.subtotal);
  $('#shippingVal').textContent = formatMAD(totals.shipping);
  $('#totalVal').textContent = formatMAD(totals.total);
  updateBadge('#cartCount', state.cart.reduce((sum, item) => sum + item.qty, 0));
};

const toggleWishlist = (id) => {
  if (state.wishlist.has(id)) {
    state.wishlist.delete(id);
    showToast('Removed from wishlist');
  } else {
    state.wishlist.add(id);
    showToast('Added to wishlist');
  }
  persistState();
  updateBadge('#wishlistCount', state.wishlist.size);
  renderProducts();
};

const addToCart = (product, options = {}) => {
  const key = `${product.id}-${options.color || ''}-${options.size || ''}`;
  const existing = state.cart.find(
    (item) => item.id === product.id && item.color === options.color && item.size === options.size
  );
  const qty = options.qty || 1;
  if (existing) {
    existing.qty += qty;
  } else {
    state.cart.push({
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      color: options.color || null,
      size: options.size || null,
      qty
    });
  }
  persistState();
  renderCart();
  showToast('Added to cart');
};

const changeQty = (index, delta) => {
  state.cart[index].qty += delta;
  if (state.cart[index].qty <= 0) state.cart.splice(index, 1);
  persistState();
  renderCart();
};

const removeFromCart = (index) => {
  state.cart.splice(index, 1);
  persistState();
  renderCart();
};

const applyPromo = (code) => {
  const trimmed = (code || '').trim();
  if (!trimmed) {
    showToast('Enter a promo code');
    return;
  }
  const match = state.settings?.promoCodes?.find(
    (promo) => promo.code.toLowerCase() === trimmed.toLowerCase()
  );
  state.promo = match || null;
  persistState();
  renderCart();
  showToast(match ? `Promo applied: ${match.code}` : 'Invalid promo');
};

const setTheme = (theme) => {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme === 'mint' ? '' : 'purple');
  const toggle = $('#themeToggle');
  if (toggle) toggle.textContent = theme === 'mint' ? '🎨' : '🌿';
  persistState();
};

const toggleTheme = () => {
  const next = state.theme === 'mint' ? 'purple' : 'mint';
  setTheme(next);
};

const openCartDrawer = () => {
  const drawer = $('#cartDrawer');
  const backdrop = $('#drawerBackdrop');
  drawer.classList.add('open');
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('show'));
};

const closeCartDrawer = () => {
  const drawer = $('#cartDrawer');
  const backdrop = $('#drawerBackdrop');
  drawer.classList.remove('open');
  backdrop.classList.remove('show');
  setTimeout(() => (backdrop.hidden = true), 220);
};

const openProductSheet = (product) => {
  state.selectedProduct = product;
  state.sheetQty = 1;
  state.sheetColor = product.colors?.[0] || null;
  state.sheetSize = product.sizesEU?.[0] || null;

  $('#sheetImage').src = product.image;
  $('#sheetImage').alt = product.title;
  $('#sheetCategory').textContent = product.category || '';
  $('#sheetTitle').textContent = product.title;
  $('#sheetRating').textContent = `⭐ ${product.rating ?? '4.8'}`;
  $('#sheetReviews').textContent = `${product.reviews ?? 200} reviews`;
  $('#sheetSold').textContent = `${product.sold ?? 1000}+ sold`;
  $('#sheetPrice').textContent = formatMAD(product.price);
  $('#sheetAbout').textContent =
    product.about ||
    'Breathable fabrics, minimal seams, and a soft finish combine for an everyday essential.';

  const colors = $('#sheetColors');
  colors.innerHTML = '';
  (product.colors || []).forEach((color) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `color-pill ${color === state.sheetColor ? 'is-active' : ''}`;
    pill.textContent = color;
    pill.addEventListener('click', () => selectSheetColor(color));
    colors.appendChild(pill);
  });

  const sizes = $('#sheetSizes');
  sizes.innerHTML = '';
  (product.sizesEU || []).forEach((size) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `size-pill ${size === state.sheetSize ? 'is-active' : ''}`;
    pill.textContent = size;
    pill.addEventListener('click', () => selectSheetSize(size));
    sizes.appendChild(pill);
  });

  $('#qtyValue').textContent = state.sheetQty;

  $('#sheetBackdrop').hidden = false;
  $('#sheetBackdrop').classList.add('show');
  $('#productSheet').classList.add('open');
};

const closeProductSheet = () => {
  $('#productSheet').classList.remove('open');
  $('#sheetBackdrop').classList.remove('show');
  setTimeout(() => ($('#sheetBackdrop').hidden = true), 220);
  state.selectedProduct = null;
};

const selectSheetColor = (color) => {
  state.sheetColor = color;
  $$('.color-pill').forEach((pill) => pill.classList.toggle('is-active', pill.textContent === color));
};

const selectSheetSize = (size) => {
  state.sheetSize = size;
  $$('.size-pill').forEach((pill) => pill.classList.toggle('is-active', pill.textContent === size));
};

const adjustSheetQty = (delta) => {
  state.sheetQty = Math.max(1, state.sheetQty + delta);
  $('#qtyValue').textContent = state.sheetQty;
};

const handleSheetAddToCart = () => {
  const product = state.selectedProduct;
  if (!product) return false;
  if (product.colors?.length && !state.sheetColor) {
    showToast('Choose a color first');
    return false;
  }
  if (product.sizesEU?.length && !state.sheetSize) {
    showToast('Choose a size first');
    return false;
  }
  addToCart(product, {
    qty: state.sheetQty,
    color: state.sheetColor,
    size: state.sheetSize
  });
  return true;
};

const handleSheetBuyNow = () => {
  if (handleSheetAddToCart()) {
    openCartDrawer();
  }
};

const submitCheckout = () => {
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
};

const populateAdminForm = (product) => {
  state.editingProductId = product.id;
  $('#adminFormTitle').textContent = `Edit Product (${product.id})`;
  $('#adminId').value = product.id;
  $('#adminTitle').value = product.title || '';
  $('#adminBrand').value = product.brand || '';
  $('#adminCategory').value = product.category || '';
  $('#adminPrice').value = product.price ?? '';
  $('#adminImage').value = product.image || '';
  $('#adminColors').value = joinCsv(product.colors);
  $('#adminSizes').value = joinCsv(product.sizesEU);
  $('#adminRating').value = product.rating ?? '';
  $('#adminReviews').value = product.reviews ?? '';
  $('#adminSold').value = product.sold ?? '';
  document.querySelector('#adminId').focus();
};

const resetAdminForm = () => {
  $('#adminForm').reset();
  $('#adminFormTitle').textContent = 'Add Product';
  state.editingProductId = null;
};

const exportProducts = () => {
  const data = JSON.stringify({ products: state.products }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `products-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('📥 Products exported successfully');
};

const importProducts = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.products && Array.isArray(data.products)) {
          const importedCount = data.products.length;
          state.products = [...state.products, ...data.products];
          persistState();
          renderProducts();
          renderAdmin();
          showToast(`📤 Imported ${importedCount} products successfully`);
        } else {
          showToast('❌ Invalid file format');
        }
      } catch (error) {
        showToast('❌ Error reading file');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

const handleAdminSubmit = (event) => {
  event.preventDefault();
  const id = $('#adminId').value.trim();
  const title = $('#adminTitle').value.trim();
  if (!id || !title) {
    showToast('❌ ID and Title are required');
    return;
  }

  // Check for duplicate ID when adding new product
  if (!state.editingProductId && state.products.some(p => p.id === id)) {
    showToast('❌ Product ID already exists');
    return;
  }

  const brand = $('#adminBrand').value.trim();
  const category = $('#adminCategory').value.trim();
  const price = Number($('#adminPrice').value) || 0;
  if (price <= 0) {
    showToast('❌ Price must be greater than 0');
    return;
  }

  const image = $('#adminImage').value.trim();
  if (!image) {
    showToast('❌ Image URL is required');
    return;
  }

  const colors = parseCsv($('#adminColors').value);
  const sizes = parseCsv($('#adminSizes').value);
  const rating = $('#adminRating').value ? Number($('#adminRating').value) : undefined;
  const reviews = $('#adminReviews').value ? Number($('#adminReviews').value) : undefined;
  const sold = $('#adminSold').value ? Number($('#adminSold').value) : undefined;

  const payload = {
    id,
    title,
    brand,
    category,
    price,
    currency: state.settings?.currency || 'MAD',
    image,
    colors,
    sizesEU: sizes,
    rating,
    reviews,
    sold
  };

  const targetId = state.editingProductId || id;
  const existingIndex = state.products.findIndex((product) => product.id === targetId);

  if (existingIndex >= 0) {
    const original = state.products[existingIndex];
    state.products[existingIndex] = { ...original, ...payload };
    if (targetId !== id) {
      state.wishlist.delete(targetId);
      state.wishlist.add(id);
      state.cart.forEach((item) => {
        if (item.id === targetId) {
          item.id = id;
          item.title = payload.title;
          item.price = payload.price;
          item.image = payload.image;
        }
      });
    } else {
      state.cart.forEach((item) => {
        if (item.id === id) {
          item.title = payload.title;
          item.price = payload.price;
          item.image = payload.image;
        }
      });
    }
    showToast(`✅ "${payload.title}" updated successfully`);
  } else {
    state.products.push(payload);
    showToast(`✅ "${payload.title}" added successfully`);
  }

  persistState();
  resetAdminForm();
  renderProducts();
  renderCart();
  renderAdmin();
};

const deleteProduct = (id) => {
  const target = state.products.find((product) => product.id === id);
  if (!target) return;
  state.products = state.products.filter((product) => product.id !== id);
  state.cart = state.cart.filter((item) => item.id !== id);
  state.wishlist.delete(id);
  if (state.editingProductId === id) resetAdminForm();
  persistState();
  renderProducts();
  renderCart();
  renderAdmin();
  updateBadge('#wishlistCount', state.wishlist.size);
  showToast(`🗑️ "${target.title}" deleted successfully`);
};

const filterAdmin = (query, mode) => {
  const term = (query || '').trim().toLowerCase();
  if (!term) return state.products;
  if (mode === 'id') {
    return state.products.filter((product) => (product.id || '').toLowerCase().includes(term));
  }
  return state.products.filter((product) => product.title.toLowerCase().includes(term));
};

const updateAdminStats = () => {
  const totalProducts = state.products.length;
  const categories = new Set(state.products.map(p => p.category).filter(Boolean));
  const totalValue = state.products.reduce((sum, p) => sum + p.price, 0);
  const avgPrice = totalProducts > 0 ? totalValue / totalProducts : 0;

  $('#totalProducts').textContent = totalProducts;
  $('#totalCategories').textContent = categories.size;
  $('#totalValue').textContent = formatMAD(totalValue);
  $('#avgPrice').textContent = formatMAD(avgPrice);
};

const renderAdmin = () => {
  updateAdminStats();
  const list = filterAdmin($('#adminSearch').value, state.adminMode);
  const root = $('#adminResults');
  root.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'admin-row admin-header';
  header.innerHTML = '<div>📷</div><div>📦 Title</div><div>🆔 ID</div><div>💰 Price</div><div>⚡ Actions</div>';
  root.appendChild(header);

  list.forEach((product) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <img src="${product.image}" alt="${product.title}">
      <div><strong>${product.title}</strong><br><small style="color:var(--muted);">${product.category || 'No category'}</small></div>
      <div><code style="background:var(--surface-2);padding:0.25rem 0.5rem;border-radius:4px;font-size:0.85rem;">${product.id}</code></div>
      <div><strong>${formatMAD(product.price)}</strong></div>
      <div class="admin-actions">
        <button class="copy-btn" type="button" title="Copy Product ID">📋 Copy ID</button>
        <button class="admin-wa-btn" type="button" title="Send via WhatsApp">📱 WA</button>
        <button class="copy-btn" type="button" data-action="edit" title="Edit Product">✏️ Edit</button>
        <button class="copy-btn" type="button" data-action="delete" title="Delete Product" style="background:#ef4444;color:white;">🗑️ Delete</button>
      </div>
    `;
    const [copyBtn, waBtn, editBtn, deleteBtn] = row.querySelectorAll('button');
    copyBtn.addEventListener('click', () => {
      copyText(product.id);
      showToast('Product ID copied!');
    });
    waBtn.addEventListener('click', () => openWhatsApp(adminCommand(product)));
    editBtn.addEventListener('click', () => populateAdminForm(product));
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete "${product.title}"? This action cannot be undone.`)) {
        deleteProduct(product.id);
      }
    });
    root.appendChild(row);
  });
};

const adminCommand = (product) =>
  `/PRODUCT id=${product.id} name="${product.title}" price=${product.price}`;

const checkAdminAuth = () => {
  if (location.hash === '#admin') {
    const stored = localStorage.getItem(STORAGE_KEYS.admin);
    if (stored !== 'shadow2002@') {
      const input = prompt('Enter admin password:');
      if (input === 'shadow2002@') {
        localStorage.setItem(STORAGE_KEYS.admin, input);
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
  const adminVisible = location.hash === '#admin';
  if (adminVisible && !checkAdminAuth()) return;
  $('#adminView').hidden = !adminVisible;
  document.querySelector('main').style.display = adminVisible ? 'none' : '';
  $('.bottom-nav').style.display = adminVisible ? 'none' : '';
  if (adminVisible) renderAdmin();
};

window.addEventListener('hashchange', updateRoute);

const initTheme = () => {
  setTheme(state.theme);
  $('#themeToggle').addEventListener('click', toggleTheme);
};

const initEventListeners = () => {
  let searchTimer;
  $('#searchInput').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchTerm = event.target.value;
      renderProducts();
    }, 300);
  });

  $$('#filters .pill').forEach((pill) =>
    pill.addEventListener('click', (event) => {
      $$('#filters .pill').forEach((p) => p.classList.remove('active'));
      const target = event.currentTarget;
      target.classList.add('active');
      state.activeCategory = target.dataset.filter || 'all';
      renderProducts();
    })
  );

  $('#openCart').addEventListener('click', openCartDrawer);
  $('#closeCart').addEventListener('click', closeCartDrawer);
  $('#drawerBackdrop').addEventListener('click', closeCartDrawer);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCartDrawer();
      closeProductSheet();
    }
  });

  $('#applyPromo').addEventListener('click', () => applyPromo($('#promoInput').value));
  $('#checkoutWhatsApp').addEventListener('click', submitCheckout);

  document.addEventListener('click', (event) => {
    const cta = event.target.closest('.promo-cta');
    if (cta) {
      event.preventDefault();
      document.querySelector('#popular')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  $('#wishlistBtn').addEventListener('click', () =>
    showToast(`Wishlist: ${state.wishlist.size} items`)
  );

  $('#sheetClose').addEventListener('click', closeProductSheet);
  $('#sheetBackdrop').addEventListener('click', closeProductSheet);
  $('#sheetShare').addEventListener('click', () => {
    if (state.selectedProduct) openWhatsApp(buildProductShareMessage(state.selectedProduct));
  });
  $('#qtyDecrease').addEventListener('click', () => adjustSheetQty(-1));
  $('#qtyIncrease').addEventListener('click', () => adjustSheetQty(1));
  $('#sheetAddToCart').addEventListener('click', handleSheetAddToCart);
  $('#sheetBuyNow').addEventListener('click', handleSheetBuyNow);

  $$('.sheet-tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      $$('.sheet-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
      $$('.sheet-pane').forEach((pane) =>
        pane.classList.toggle('is-active', pane.dataset.pane === name)
      );
    })
  );

  $('#adminSearch').addEventListener('input', renderAdmin);
  $$('input[name="admin-mode"]').forEach((radio) =>
    radio.addEventListener('change', (event) => {
      state.adminMode = event.target.value;
      renderAdmin();
    })
  );
  $('#adminLogout').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.admin);
    showToast('Admin logged out');
    location.hash = '#';
  });

  $('#adminForm').addEventListener('submit', handleAdminSubmit);
  $('#adminFormReset').addEventListener('click', resetAdminForm);
  $('#adminImport').addEventListener('click', importProducts);
  $('#adminExport').addEventListener('click', exportProducts);
};

const init = async () => {
  loadState();
  $('#year').textContent = new Date().getFullYear();
  initTheme();
  initEventListeners();
  updateBadge('#wishlistCount', state.wishlist.size);
  renderCart();
  resetAdminForm();

  const [settingsRes, productsRes] = await Promise.all([
    fetch(SETTINGS_URL),
    fetch(PRODUCTS_URL)
  ]);
  state.settings = await settingsRes.json();
  const data = await productsRes.json();
  state.products = data.products || [];
  renderProducts();
  renderAdmin();
  updateRoute();
};

document.addEventListener('DOMContentLoaded', init);
