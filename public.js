(function () {
  const STORAGE_KEYS = {
    products: 'produtos',
    orders: 'pedidos_publico'
  };

  const fallbackImage = 'img/placeholder.jpg';
  const constants = window.APP_CONSTANTS || {};
  const categories = constants.CATEGORIES || [
    'Moda Feminina', 'Moda Masculina', 'Infantil', 'Calçados',
    'Perfume', 'Acessórios', 'Bijuterias', 'Outros'
  ];
  const PIX_KEY = constants.PIX_KEY || '11913563576';
  const CHECKOUT_NUMBER = constants.CHECKOUT_WHATSAPP_NUMBER || '5511913563576';

  let products = [];
  let cart = [];
  let categoryFilter = '';
  let db = null;
  let firebaseEnabled = false;

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

  function getVariantOptions(product, stockField, legacyField) {
    function splitLabels(labelText) {
      return String(labelText || '')
        .split(/[-/|;]/)
        .map(x => x.trim())
        .filter(Boolean);
    }

    if (Array.isArray(product?.[stockField]) && product[stockField].length) {
      return product[stockField]
        .flatMap(v => {
          const labels = splitLabels(v?.label || '');
          const stock = v?.stock === null || v?.stock === undefined ? null : Math.max(0, parseInt(v.stock, 10) || 0);
          return labels.map(label => ({ label, stock }));
        })
        .filter(v => v.label);
    }

    const legacy = Array.isArray(product?.[legacyField])
      ? product[legacyField]
      : String(product?.[legacyField] || '').split(',').map(x => x.trim()).filter(Boolean);
    return legacy
      .flatMap(label => splitLabels(label).map(part => ({ label: part, stock: null })))
      .filter(v => v.label);
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

  async function saveOrder(order) {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.orders)) || [];
    list.unshift(order);
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(list));
    if (firebaseEnabled) {
      try { await db.collection('orders').doc(order.numero).set(order); } catch (_) {}
    }
  }

  function renderCategoryFilter() {
    const root = document.getElementById('categoryFilter');
    root.innerHTML = ['Todas', ...categories].map(cat => {
      const active = (cat === 'Todas' && !categoryFilter) || cat === categoryFilter ? 'active' : '';
      return `<button class="${active}" data-cat="${cat}">${cat}</button>`;
    }).join('');

    root.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.cat;
        categoryFilter = v === 'Todas' ? '' : v;
        renderCategoryFilter();
        renderCatalog();
      });
    });
  }

  function productCard(p, idx) {
    const sizes = getVariantOptions(p, 'sizesStock', 'sizes');
    const numbers = getVariantOptions(p, 'numbersStock', 'numbers');
    const hasSizeData = sizes.length > 0;
    const hasNumberData = numbers.length > 0;
    const showSizes = !p.hideSizes && hasSizeData;
    const showNumbers = !p.hideNumbers && hasNumberData;
    const availableSizes = sizes.filter(v => v.stock === null || v.stock > 0);
    const availableNumbers = numbers.filter(v => v.stock === null || v.stock > 0);

    const sizeSelect = !showSizes
      ? ''
      : availableSizes.length
      ? `<select id="size-${idx}"><option value="">Tamanho</option>${availableSizes.map(v => `<option value="${v.label}">${v.label}${v.stock !== null ? ` (${v.stock})` : ''}</option>`).join('')}</select>`
      : `<select id="size-${idx}" disabled><option>Sem estoque de tamanho</option></select>`;

    const numSelect = !showNumbers
      ? ''
      : availableNumbers.length
      ? `<select id="num-${idx}"><option value="">Numeração</option>${availableNumbers.map(v => `<option value="${v.label}">${v.label}${v.stock !== null ? ` (${v.stock})` : ''}</option>`).join('')}</select>`
      : `<select id="num-${idx}" disabled><option>Sem estoque de numeração</option></select>`;

    const variationsHtml = (showSizes || showNumbers)
      ? `<div class="variations">${sizeSelect}${numSelect}</div>`
      : '';

    return `
      <article class="product-card">
        <img src="${p.imagem || fallbackImage}" onerror="this.onerror=null;this.src='${fallbackImage}'" alt="${p.nome || 'Produto'}">
        <a
          class="wa-float"
          href="https://wa.me/${String(p.whats || CHECKOUT_NUMBER).replace(/\D/g, '')}?text=${encodeURIComponent(`Olá, tenho uma dúvida sobre o produto: ${p.nome || 'Produto'}`)}"
          target="_blank"
          rel="noopener noreferrer"
          title="Perguntar no WhatsApp"
        >💬</a>
        <h4>${p.nome || 'Produto'}</h4>
        <small>${p.descricao || ''}</small>
        <div class="price">${money(p.preco || 0)}</div>
        ${variationsHtml}
        <button class="buy-btn" data-index="${idx}">Adicionar ao carrinho</button>
      </article>
    `;
  }

  function renderCatalog() {
    const root = document.getElementById('catalogSections');
    const list = categoryFilter ? categories.filter(c => c === categoryFilter) : categories;

    root.innerHTML = list.map(cat => {
      const items = products.filter(p => (p.categoria || 'Outros') === cat);
      if (!items.length) return '';
      return `
        <section class="catalog-group">
          <h3>${cat}</h3>
          <div class="products-grid">
            ${items.map(p => productCard(p, products.indexOf(p))).join('')}
          </div>
        </section>
      `;
    }).join('') || '<p>Nenhum produto cadastrado.</p>';

    root.querySelectorAll('.buy-btn').forEach(btn => {
      btn.addEventListener('click', () => addToCart(parseInt(btn.dataset.index, 10)));
    });
  }

  function addToCart(index) {
    const p = products[index];
    if (!p) return;
    const size = p.hideSizes ? '' : (document.getElementById(`size-${index}`)?.value || '');
    const number = p.hideNumbers ? '' : (document.getElementById(`num-${index}`)?.value || '');
    const sizeOptions = getVariantOptions(p, 'sizesStock', 'sizes');
    const numberOptions = getVariantOptions(p, 'numbersStock', 'numbers');
    const availableSizes = sizeOptions.filter(v => v.stock === null || v.stock > 0);
    const availableNumbers = numberOptions.filter(v => v.stock === null || v.stock > 0);
    const hasSizes = !p.hideSizes && availableSizes.length > 0;
    const hasNumbers = !p.hideNumbers && availableNumbers.length > 0;
    const sizeOutOfStock = !p.hideSizes && sizeOptions.length > 0 && availableSizes.length === 0;
    const numberOutOfStock = !p.hideNumbers && numberOptions.length > 0 && availableNumbers.length === 0;

    if (sizeOutOfStock) {
      alert('Este produto está sem estoque de tamanhos no momento.');
      return;
    }
    if (numberOutOfStock) {
      alert('Este produto está sem estoque de numeração no momento.');
      return;
    }

    if (hasSizes && !size) {
      alert('Selecione um tamanho disponível antes de adicionar ao carrinho.');
      return;
    }
    if (hasNumbers && !number) {
      alert('Selecione uma numeração disponível antes de adicionar ao carrinho.');
      return;
    }

    cart.push({
      ...p,
      selectedSize: size,
      selectedNumber: number
    });
    renderCart();
  }

  function cartSubtotal() {
    return cart.reduce((acc, item) => acc + parseMoney(item.preco || 0), 0);
  }

  function renderCart() {
    const itemsRoot = document.getElementById('cartItems');
    const summaryRoot = document.getElementById('cartSummary');
    const count = document.getElementById('cartCount');

    itemsRoot.innerHTML = cart.map((p, i) => {
      const vars = [p.selectedSize ? `Tam: ${p.selectedSize}` : '', p.selectedNumber ? `Nº: ${p.selectedNumber}` : ''].filter(Boolean).join(' | ');
      return `<div>• ${p.nome} ${vars ? `(${vars})` : ''} - ${money(p.preco)} <span data-rm="${i}" style="cursor:pointer">❌</span></div>`;
    }).join('') || 'Carrinho vazio.';

    summaryRoot.innerHTML = `
      Subtotal: ${money(cartSubtotal())}<br>
      Frete: calculado pelo vendedor no WhatsApp<br>
      <strong>Total parcial: ${money(cartSubtotal())}</strong>
    `;

    count.textContent = String(cart.length);
    itemsRoot.querySelectorAll('[data-rm]').forEach(el => {
      el.addEventListener('click', () => {
        cart.splice(parseInt(el.dataset.rm, 10), 1);
        renderCart();
      });
    });
  }

  function validateClient() {
    const nome = (document.getElementById('clienteNome').value || '').trim();
    const cpf = (document.getElementById('clienteCpf').value || '').trim();
    const contato = (document.getElementById('clienteContato').value || '').trim();
    const formaPagamento = (document.getElementById('formaPagamento').value || '').trim();
    const rua = (document.getElementById('enderecoRua').value || '').trim();
    const numero = (document.getElementById('enderecoNumero').value || '').trim();
    const cidade = (document.getElementById('enderecoCidade').value || '').trim();
    const cep = (document.getElementById('enderecoCep').value || '').trim();

    if (!nome || !cpf || !contato || !formaPagamento || !rua || !numero || !cidade || !cep) {
      alert('Preencha todos os campos obrigatórios.');
      return null;
    }
    if (cpf.replace(/\D/g, '').length !== 11) {
      alert('CPF inválido.');
      return null;
    }
    if (cep.replace(/\D/g, '').length !== 8) {
      alert('CEP inválido.');
      return null;
    }
    return { nome, cpf, contato, formaPagamento, endereco: `Rua ${rua}, Nº ${numero}, ${cidade}, CEP ${cep}` };
  }

  async function finishOrder() {
    if (!cart.length) {
      alert('Carrinho vazio.');
      return;
    }
    const client = validateClient();
    if (!client) return;

    const numeroPedido = `PED-${Date.now().toString().slice(-6)}`;
    const dataPedido = new Date().toLocaleString('pt-BR');
    const totalParcial = cartSubtotal();

    let msg = `*Nota do Pedido*\nNúmero: ${numeroPedido}\nData: ${dataPedido}\n\n*Itens:*\n`;
    cart.forEach(item => {
      const vars = [item.selectedSize ? `Tam: ${item.selectedSize}` : '', item.selectedNumber ? `Nº: ${item.selectedNumber}` : ''].filter(Boolean).join(' | ');
      msg += `- ${item.nome} ${vars ? `(${vars})` : ''} | R$ ${parseMoney(item.preco).toFixed(2)}\n`;
    });

    msg += `\n*Total dos produtos:* R$ ${totalParcial.toFixed(2)}\n`;
    msg += `*Frete:* será calculado pelo vendedor no WhatsApp\n`;
    msg += `*Total parcial (sem frete):* R$ ${totalParcial.toFixed(2)}\n`;
    msg += `\n*Dados do cliente*\n`;
    msg += `Nome: ${client.nome}\nCPF: ${client.cpf}\nContato: ${client.contato}\nPagamento: ${client.formaPagamento}\nEndereço: ${client.endereco}\n`;

    if (client.formaPagamento === 'PIX') {
      msg += `\n*Pagamento via PIX*\nChave PIX: ${PIX_KEY}\nFavor enviar o comprovante após o pagamento.\n`;
    } else {
      msg += `\nForma de pagamento: consulte o vendedor.\n`;
    }

    await saveOrder({
      numero: numeroPedido,
      data: dataPedido,
      cliente: client,
      itens: cart.map(i => ({ nome: i.nome, valor: parseMoney(i.preco), tamanho: i.selectedSize || '', numeracao: i.selectedNumber || '' })),
      totalParcial,
      status: 'enviado_whatsapp'
    });

    const url = `https://wa.me/${CHECKOUT_NUMBER}?text=${encodeURIComponent(msg)}`;
    const tab = window.open(url, '_blank');
    if (!tab) window.location.href = url;
  }

  function copyPix() {
    navigator.clipboard?.writeText(PIX_KEY).then(() => alert('PIX copiado.')).catch(() => alert(`PIX: ${PIX_KEY}`));
  }

  function toggleCart() {
    document.getElementById('cartPanel').classList.toggle('open');
  }

  async function init() {
    initFirebase();
    await loadProducts();
    renderCategoryFilter();
    renderCatalog();
    renderCart();

    document.getElementById('cartToggle').addEventListener('click', toggleCart);
    document.getElementById('finishBtn').addEventListener('click', finishOrder);
    document.getElementById('copyPixBtn').addEventListener('click', copyPix);
  }

  init();
})();
