(function () {
  const constants = window.APP_CONSTANTS || {};
  const categories = constants.CATEGORIES || [
    'Moda Feminina', 'Moda Masculina', 'Infantil', 'Calçados',
    'Perfume', 'Acessórios', 'Bijuterias', 'Outros'
  ];

  const STORAGE_KEYS = {
    token: 'admin_session',
    products: 'produtos',
    orders: 'pedidos_publico'
  };

  let db = null;
  let firebaseEnabled = false;
  let editingId = null;
  let products = [];
  let orders = [];

  function parseMoney(value) {
    const txt = String(value || '').trim().replace(/[^\d.,-]/g, '');
    if (!txt) return 0;
    let norm = txt;
    if (txt.includes(',') && txt.includes('.')) {
      norm = txt.lastIndexOf(',') > txt.lastIndexOf('.')
        ? txt.replace(/\./g, '').replace(',', '.')
        : txt.replace(/,/g, '');
    } else if (txt.includes(',')) {
      norm = txt.replace(',', '.');
    }
    const n = parseFloat(norm);
    return Number.isFinite(n) ? n : 0;
  }

  function money(v) {
    return parseMoney(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parseVariantStockInput(raw) {
    function splitLabels(labelText) {
      return String(labelText || '')
        .split(/[-/|;]/)
        .map(x => x.trim())
        .filter(Boolean);
    }

    return String(raw || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .flatMap(token => {
        const [labelRaw, stockRaw] = token.split(':').map(x => (x || '').trim());
        const labels = splitLabels(labelRaw);
        if (!labels.length) return [];

        if (stockRaw === undefined || stockRaw === '') {
          return labels.map(label => ({ label, stock: null }));
        }

        const stock = Math.max(0, parseInt(stockRaw, 10) || 0);
        return labels.map(label => ({ label, stock }));
      })
      .filter(Boolean);
  }

  function variantsToInput(list) {
    return (Array.isArray(list) ? list : [])
      .map(v => {
        if (!v || !v.label) return '';
        return v.stock === null || v.stock === undefined ? v.label : `${v.label}:${v.stock}`;
      })
      .filter(Boolean)
      .join(',');
  }

  function getVariantList(product, stockField, legacyField) {
    if (Array.isArray(product?.[stockField]) && product[stockField].length) {
      return product[stockField];
    }
    const legacy = Array.isArray(product?.[legacyField])
      ? product[legacyField]
      : String(product?.[legacyField] || '').split(',').map(x => x.trim()).filter(Boolean);
    return legacy.map(label => ({ label, stock: null }));
  }

  function waitImageLoad(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Não foi possível ler a imagem.'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha ao converter imagem.'));
      reader.readAsDataURL(blob);
    });
  }

  async function compressImageFile(file, targetKb = 180, maxDimension = 1200) {
    const img = await waitImageLoad(file);
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    let width = Math.max(1, Math.round(img.width * scale));
    let height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let step = 0; step < 6; step++) {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      for (let q = 0.86; q >= 0.42; q -= 0.08) {
        const webpBlob = await canvasToBlob(canvas, 'image/webp', q);
        if (webpBlob && webpBlob.size / 1024 <= targetKb) {
          return { dataUrl: await blobToDataUrl(webpBlob), kb: Math.round(webpBlob.size / 1024), type: 'webp' };
        }
      }

      width = Math.max(420, Math.round(width * 0.86));
      height = Math.max(420, Math.round(height * 0.86));
    }

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const fallbackBlob = await canvasToBlob(canvas, 'image/jpeg', 0.55);
    return { dataUrl: await blobToDataUrl(fallbackBlob), kb: Math.round(fallbackBlob.size / 1024), type: 'jpeg' };
  }

  function firebaseReadyConfig() {
    const cfg = window.FIREBASE_CONFIG || {};
    return cfg.apiKey && !String(cfg.apiKey).includes('YOUR_');
  }

  function initFirebase() {
    if (!window.firebase || !firebaseReadyConfig()) return;
    if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.firestore();
    firebaseEnabled = true;
  }

  function onLoginPage() {
    return location.pathname.toLowerCase().includes('admin-login');
  }

  function onAdminPage() {
    return location.pathname.toLowerCase().endsWith('admin.html');
  }

  async function login(email, password) {
    if (firebaseEnabled) {
      await firebase.auth().signInWithEmailAndPassword(email, password);
      localStorage.setItem(STORAGE_KEYS.token, 'firebase');
      return;
    }

    if (email === 'admin@local' && password === '123456') {
      localStorage.setItem(STORAGE_KEYS.token, 'local');
      return;
    }

    throw new Error('Credenciais inválidas.');
  }

  async function logout() {
    localStorage.removeItem(STORAGE_KEYS.token);
    if (firebaseEnabled && firebase.auth().currentUser) {
      await firebase.auth().signOut();
    }
  }

  function isLogged() {
    return Boolean(localStorage.getItem(STORAGE_KEYS.token));
  }

  async function loadProducts() {
    if (firebaseEnabled) {
      try {
        const snap = await db.collection('products').orderBy('nome').get();
        products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
        return;
      } catch (_) {}
    }
    products = JSON.parse(localStorage.getItem(STORAGE_KEYS.products)) || [];
  }

  async function loadOrders() {
    if (firebaseEnabled) {
      try {
        const snap = await db.collection('orders').orderBy('data', 'desc').get();
        orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (_) {
        orders = JSON.parse(localStorage.getItem(STORAGE_KEYS.orders)) || [];
      }
      return;
    }
    orders = JSON.parse(localStorage.getItem(STORAGE_KEYS.orders)) || [];
  }

  async function persistProduct(product) {
    if (firebaseEnabled) {
      if (product.id) {
        const id = product.id;
        const payload = { ...product };
        delete payload.id;
        await db.collection('products').doc(id).set(payload, { merge: true });
      } else {
        const ref = await db.collection('products').add(product);
        product.id = ref.id;
      }
    } else {
      if (!product.id) product.id = 'local-' + Date.now();
    }

    const i = products.findIndex(p => p.id === product.id);
    if (i >= 0) products[i] = product;
    else products.unshift(product);
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
  }

  async function removeProduct(id) {
    if (firebaseEnabled) {
      try { await db.collection('products').doc(id).delete(); } catch (_) {}
    }
    products = products.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
  }

  function renderCategoriesSelect() {
    const sel = document.getElementById('categoriaSelect');
    if (sel) {
      sel.innerHTML = `<option value="">Selecione categoria</option>${categories.map(c => `<option>${c}</option>`).join('')}`;
    }

    const filterSel = document.getElementById('filterProductsCategory');
    if (filterSel) {
      filterSel.innerHTML = `<option value="">☰ Todas categorias</option>${categories.map(c => `<option value="${c}">${c}</option>`).join('')}`;
    }
  }

  function renderProducts(list = products) {
    const root = document.getElementById('productsList');
    if (!root) return;

    root.innerHTML = list.map(p => `
      <div class="product-item">
        <div class="product-main">
          <img class="product-thumb" src="${p.imagem || 'img/placeholder.jpg'}" alt="${p.nome || 'Produto'}" onerror="this.onerror=null;this.src='img/placeholder.jpg'">
          <div>
          <strong>${p.nome || 'Produto'}</strong>
          <small>${p.categoria || 'Sem categoria'} • ${money(p.preco || 0)}</small>
          <small>Tamanhos: ${p.hideSizes ? 'Oculto' : (getVariantList(p, 'sizesStock', 'sizes').map(v => v.stock === null || v.stock === undefined ? v.label : `${v.label}(${v.stock})`).join(', ') || '-')}</small>
          <small>Numeração: ${p.hideNumbers ? 'Oculta' : (getVariantList(p, 'numbersStock', 'numbers').map(v => v.stock === null || v.stock === undefined ? v.label : `${v.label}(${v.stock})`).join(', ') || '-')}</small>
          </div>
        </div>
        <div class="actions">
          <button class="edit" data-edit="${p.id}">Editar</button>
          <button class="del" data-del="${p.id}">Excluir</button>
        </div>
      </div>
    `).join('') || 'Nenhum produto cadastrado.';

    root.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => fillForm(btn.dataset.edit));
    });

    root.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir produto?')) return;
        await removeProduct(btn.dataset.del);
        renderProducts();
      });
    });
  }

  function renderOrders(list = orders) {
    const root = document.getElementById('ordersList');
    if (!root) return;

    root.innerHTML = list.map(o => `
      <div class="order-item">
        <div>
          <strong>${o.numero || 'PED-xxxxxx'}</strong>
          <small>${o.data || '-'} • ${o.cliente?.nome || 'Sem cliente'}</small>
          <small>Total parcial: ${money(o.totalParcial || 0)}</small>
        </div>
        <div class="actions">
          <button class="edit" data-view="${o.numero || ''}">Ver</button>
        </div>
      </div>
    `).join('') || 'Nenhum pedido encontrado.';

    root.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ord = orders.find(o => (o.numero || '') === btn.dataset.view);
        if (!ord) return;
        const itens = (ord.itens || []).map(i => `- ${i.nome} | ${money(i.valor)}`).join('\n');
        alert(
          `Pedido: ${ord.numero}\nData: ${ord.data}\nCliente: ${ord.cliente?.nome || '-'}\nContato: ${ord.cliente?.contato || '-'}\n\nItens:\n${itens}`
        );
      });
    });
  }

  function fillForm(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    const form = document.getElementById('productForm');
    form.nome.value = p.nome || '';
    form.preco.value = p.preco || '';
    form.categoria.value = p.categoria || '';
    form.imagem.value = p.imagem || '';
    form.imagemFile.value = '';
    form.whats.value = p.whats || '';
    form.sizes.value = variantsToInput(getVariantList(p, 'sizesStock', 'sizes'));
    form.numbers.value = variantsToInput(getVariantList(p, 'numbersStock', 'numbers'));
    form.hideSizes.checked = !!p.hideSizes;
    form.hideNumbers.checked = !!p.hideNumbers;
    form.descricao.value = p.descricao || '';
    const status = document.getElementById('imgStatus');
    if (status) status.textContent = p.imagem ? 'Imagem atual carregada. Selecione outra apenas se quiser trocar.' : 'Sem imagem. Selecione um arquivo.';
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const f = e.target;
    const imageFile = f.imagemFile.files?.[0];
    const status = document.getElementById('imgStatus');
    let imagemFinal = f.imagem.value.trim();

    if (imageFile) {
      if (status) status.textContent = 'Processando imagem e reduzindo tamanho...';
      const compressed = await compressImageFile(imageFile, 180, 1200);
      imagemFinal = compressed.dataUrl;
      if (status) status.textContent = `Imagem pronta (${compressed.kb}KB, ${compressed.type.toUpperCase()}).`;
    }

    const product = {
      id: editingId || undefined,
      nome: f.nome.value.trim(),
      preco: parseMoney(f.preco.value),
      categoria: f.categoria.value,
      imagem: imagemFinal,
      whats: f.whats.value.trim(),
      sizesStock: parseVariantStockInput(f.sizes.value),
      numbersStock: parseVariantStockInput(f.numbers.value),
      sizes: parseVariantStockInput(f.sizes.value).map(v => v.label),
      numbers: parseVariantStockInput(f.numbers.value).map(v => v.label),
      hideSizes: !!f.hideSizes.checked,
      hideNumbers: !!f.hideNumbers.checked,
      descricao: f.descricao.value.trim()
    };

    if (!product.nome || !product.preco || !product.categoria || !product.whats) {
      alert('Preencha os campos obrigatórios do produto.');
      return;
    }

    await persistProduct(product);
    editingId = null;
    f.reset();
    f.imagem.value = '';
    if (status) status.textContent = 'Imagem: você pode enviar direto do celular/computador. Compressão automática até ~180KB.';
    renderProducts();
  }

  function getFilteredProducts() {
    const q = (document.getElementById('searchProducts')?.value || '').trim().toLowerCase();
    const cat = (document.getElementById('filterProductsCategory')?.value || '').trim().toLowerCase();
    return products.filter(p => {
      const name = (p.nome || '').toLowerCase();
      const category = (p.categoria || '').toLowerCase();
      const matchText = !q || name.includes(q) || category.includes(q);
      const matchCat = !cat || category === cat;
      return matchText && matchCat;
    });
  }

  function setupSearch() {
    const sp = document.getElementById('searchProducts');
    const sc = document.getElementById('filterProductsCategory');
    const so = document.getElementById('searchOrders');

    sp?.addEventListener('input', () => {
      renderProducts(getFilteredProducts());
    });

    sc?.addEventListener('change', () => {
      renderProducts(getFilteredProducts());
    });

    so?.addEventListener('input', () => {
      const q = so.value.trim().toUpperCase();
      const filtered = orders.filter(o =>
        (o.numero || '').toUpperCase().includes(q) ||
        (o.cliente?.nome || '').toUpperCase().includes(q)
      );
      renderOrders(filtered);
    });
  }

  async function setupLoginPage() {
    if (isLogged()) {
      location.href = 'admin.html';
      return;
    }

    document.getElementById('loginBtn').addEventListener('click', async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      try {
        await login(email, password);
        location.href = 'admin.html';
      } catch (err) {
        alert(err.message || 'Erro no login.');
      }
    });
  }

  async function setupAdminPage() {
    if (!isLogged()) {
      location.href = 'admin-login.html';
      return;
    }

    renderCategoriesSelect();
    await loadProducts();
    await loadOrders();
    renderProducts();
    renderOrders();

    document.getElementById('productForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await logout();
      location.href = 'admin-login.html';
    });

    setupSearch();
  }

  async function init() {
    initFirebase();
    if (onLoginPage()) await setupLoginPage();
    if (onAdminPage()) await setupAdminPage();
  }

  init();
})();
