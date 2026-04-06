let produtos = JSON.parse(localStorage.getItem("produtos")) || [];
let categorias = JSON.parse(localStorage.getItem("categorias")) || ["Beleza","Roupas","Outros"];
let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];
let pedidos = JSON.parse(localStorage.getItem("pedidos")) || [];

const tela = document.getElementById('tela');
const btnProdutos = document.getElementById('btnProdutos');
const btnGerenciar = document.getElementById('btnGerenciar');
const DEFAULT_PRODUCT_IMAGE = "img/placeholder.jpg";
const PIX_KEY = "11913563576";
const CHECKOUT_WHATSAPP_NUMBER = "5511913563576";
let filtroGerenciarTexto = '';
let filtroGerenciarCategoria = '';
let filtroPedidoAdmin = '';

function parseValor(valor){
 if(typeof valor === 'number') return valor;
 const txt = String(valor || '').trim();
 if(!txt) return 0;
 let normalizado = txt.replace(/[^\d.,-]/g, '');
 const temVirgula = normalizado.includes(',');
 const temPonto = normalizado.includes('.');

 if(temVirgula && temPonto){
  if(normalizado.lastIndexOf(',') > normalizado.lastIndexOf('.')){
   normalizado = normalizado.replace(/\./g, '').replace(',', '.');
  } else {
   normalizado = normalizado.replace(/,/g, '');
  }
 } else if(temVirgula){
  normalizado = normalizado.replace(',', '.');
 }

 const numero = parseFloat(normalizado);
 return Number.isFinite(numero) ? numero : 0;
}

function formatarMoeda(valor){
 return parseValor(valor).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}

function obterSubtotalCarrinho(){
 return carrinho.reduce((acc, p) => acc + parseValor(p.promo || p.preco || 0), 0);
}

function salvar(){
 localStorage.setItem('produtos',JSON.stringify(produtos));
 localStorage.setItem('categorias',JSON.stringify(categorias));
 localStorage.setItem('carrinho',JSON.stringify(carrinho));
 localStorage.setItem('pedidos',JSON.stringify(pedidos));
}

function setActive(tipo){
 btnProdutos.classList.remove('active');
 btnGerenciar.classList.remove('active');
 if(tipo==='produtos') btnProdutos.classList.add('active');
 else btnGerenciar.classList.add('active');
}

function verProdutos(){
 setActive('produtos');
 tela.innerHTML=`
 <div class='banner'>
   <h2>🛍️ Nossos Produtos</h2>
   <p>Encontre o que você precisa e fale direto conosco pelo WhatsApp</p>
 </div>
 <div class='top-bar'>
  <input placeholder='Buscar' oninput='filtrar(this.value)'>
  <select onchange='filtrarCat(this.value)'>
    <option value=''>Todas</option>
    ${categorias.map(c=>`<option>${c}</option>`).join('')}
  </select>
 </div>
 <div class='grid' id='grid'></div>`;
 renderProdutos(produtos);
 renderCarrinho();
}

function renderProdutos(lista){
 let html="";
 lista.forEach((p,i)=>{
  const img = (p.imagens && p.imagens[0]) ? p.imagens[0] : DEFAULT_PRODUCT_IMAGE;
  const valor = p.promo || p.preco || 0;
  html+=`<div class='prod-card'>
   <div class='carousel'>
     <img id='img${i}' src='${img}' onerror="this.onerror=null;this.src='${DEFAULT_PRODUCT_IMAGE}'">
     <button class='prev' onclick='trocar(${i},-1)'>‹</button>
     <button class='next' onclick='trocar(${i},1)'>›</button>
   </div>
   <h4>${p.nome||''}</h4>
   <small style="color:#666">${p.descricao || ''}</small>
   <div class='${p.promo?"promo":"price"}'>R$ ${valor}</div>
   <button class='btn' onclick='addCarrinho(${i})'>Comprar</button>
   <button class='btn' style="background:#25D366" onclick="abrirWhats('${p.whats || ''}','${p.nome || ''}')">💬 WhatsApp</button>
  </div>`;
 });
 document.getElementById('grid').innerHTML=html;
}

function trocar(i,dir){
 let p = produtos[i];
 if(!p.imagens || p.imagens.length===0) return;
 p.idx = (p.idx||0)+dir;
 if(p.idx<0) p.idx = p.imagens.length-1;
 if(p.idx>=p.imagens.length) p.idx = 0;
 const imgEl = document.getElementById('img'+i);
 if(!imgEl) return;
 imgEl.onerror = function(){ this.onerror = null; this.src = DEFAULT_PRODUCT_IMAGE; };
 imgEl.src = p.imagens[p.idx];
}

function filtrar(txt){
 renderProdutos(produtos.filter(p=> (p.nome||'').toLowerCase().includes(txt.toLowerCase())));
}
function filtrarCat(cat){
 renderProdutos(cat?produtos.filter(p=>p.categoria===cat):produtos);
}

function addCarrinho(i){
 carrinho.push(produtos[i]); salvar(); renderCarrinho();
}
function renderCarrinho(){
 let html="", subtotal=0;
 carrinho.forEach((p,i)=>{
  const v = parseValor(p.promo||p.preco||0);
  subtotal+=v;
  html+=`• ${p.nome} - R$ ${v.toFixed(2)} <span onclick='remover(${i})' style='cursor:pointer'>❌</span><br>`;
 });
 document.getElementById('carrinho').innerHTML=html;
 document.getElementById('total').innerHTML =
  `Subtotal: ${formatarMoeda(subtotal)}<br>` +
  `Frete: calculado pelo vendedor no WhatsApp<br>` +
  `<strong>Total parcial: ${formatarMoeda(subtotal)}</strong>`;
 document.getElementById('badge').innerText = carrinho.length;
}
function remover(i){ carrinho.splice(i,1); salvar(); renderCarrinho(); }

function toggleCart(){
 const b=document.getElementById('cartBox');
 b.style.display = b.style.display==='block'?'none':'block';
}

function copiarPix(){
 const chave = PIX_KEY;
 if(navigator.clipboard && window.isSecureContext){
  navigator.clipboard.writeText(chave).then(()=>alert('PIX copiado')).catch(()=>fallbackCopy(chave));
 } else fallbackCopy(chave);
}
function fallbackCopy(text){
 const t=document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select();
 try{ document.execCommand('copy'); alert('PIX copiado'); }catch(e){ alert('Copie manual: '+text); }
 document.body.removeChild(t);
}

function calcularFrete(){
 alert('O frete é calculado pelo vendedor e informado no WhatsApp.');
}

function abrirWhats(numero,nome){
 if(!numero){ alert('WhatsApp não cadastrado'); return; }
 const msg = encodeURIComponent('Olá, tenho interesse no produto: '+nome);
 window.open('https://wa.me/'+numero+'?text='+msg);
}

function finalizarCompra(){
 if(carrinho.length===0){ alert('Carrinho vazio'); return; }
 const nome = (document.getElementById('clienteNome').value || '').trim();
 const cpf = (document.getElementById('clienteCpf').value || '').trim();
 const contato = (document.getElementById('clienteContato').value || '').trim();
 const formaPagamento = (document.getElementById('formaPagamento').value || '').trim();
 const enderecoRua = (document.getElementById('enderecoRua').value || '').trim();
 const enderecoNumero = (document.getElementById('enderecoNumero').value || '').trim();
 const enderecoCidade = (document.getElementById('enderecoCidade').value || '').trim();
 const enderecoCep = (document.getElementById('enderecoCep').value || '').trim();
 const cpfNumerico = cpf.replace(/\D/g,'');
 const contatoNumerico = contato.replace(/\D/g,'');
 const cepNumerico = enderecoCep.replace(/\D/g,'');

 if(!nome || !cpf || !contato || !formaPagamento || !enderecoRua || !enderecoNumero || !enderecoCidade || !enderecoCep){
  alert('Preencha todos os campos obrigatórios do cliente e endereço para finalizar no WhatsApp');
  return;
 }
 if(cpfNumerico.length !== 11){
  alert('CPF inválido. Informe os 11 dígitos.');
  return;
 }
 if(contatoNumerico.length < 10){
  alert('Contato inválido. Informe DDD + número.');
  return;
 }
 if(cepNumerico.length !== 8){
  alert('CEP inválido. Informe os 8 dígitos.');
  return;
 }

 const numeroPedido = `PED-${Date.now().toString().slice(-6)}`;
 const dataPedido = new Date().toLocaleString('pt-BR');
 let msg=`*Nota do Pedido*\nNúmero: ${numeroPedido}\nData: ${dataPedido}\n\n*Itens:*\n`, subtotal=0;
 carrinho.forEach(p=>{
  const v=parseValor(p.promo||p.preco||0);
  subtotal+=v;
  msg+=`- ${p.nome} | R$ ${v.toFixed(2)}\n`;
 });

 let totalFinal = subtotal;
 msg+=`\n*Total dos produtos:* R$ ${subtotal.toFixed(2)}\n`;
 msg+='*Frete:* será calculado pelo vendedor no WhatsApp\n';
 msg+=`*Total parcial (sem frete):* R$ ${totalFinal.toFixed(2)}\n`;
 msg+='\n*Dados do cliente*\n';
 msg+=`Nome: ${nome}\n`;
 msg+=`CPF: ${cpf}\n`;
 msg+=`Contato: ${contato}\n`;
 msg+=`Pagamento: ${formaPagamento}\n`;
 msg+=`Endereço: Rua ${enderecoRua}, Nº ${enderecoNumero}, ${enderecoCidade}, CEP ${enderecoCep}\n`;

 if(formaPagamento === 'PIX'){
  msg+='\n*Pagamento via PIX*\n';
  msg+=`Chave PIX: ${PIX_KEY}\n`;
  msg+='Favor enviar o comprovante após o pagamento.\n';
 } else {
  msg+='\nForma de pagamento: consulte o vendedor.\n';
 }

 const enderecoCompleto = `Rua ${enderecoRua}, Nº ${enderecoNumero}, ${enderecoCidade}, CEP ${enderecoCep}`;
 pedidos.unshift({
  numero: numeroPedido,
  data: dataPedido,
  cliente: {
   nome,
   cpf,
   contato,
   formaPagamento,
   endereco: enderecoCompleto
  },
  itens: carrinho.map(p => ({
   nome: p.nome || 'Produto',
   valor: parseValor(p.promo || p.preco || 0)
  })),
  totalParcial: parseFloat(totalFinal.toFixed(2)),
  status: 'enviado_whatsapp'
 });
 salvar();

 const urlCheckout = 'https://wa.me/'+CHECKOUT_WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg);
 const novaAba = window.open(urlCheckout, '_blank');
 if(!novaAba){
  window.location.href = urlCheckout;
 }
}

function abrirGerenciar(){
 setActive('gerenciar');
 let html=`
 <div class='manage-header'>
  <div>
   <h2>Painel Administrativo</h2>
   <small>Cadastre produtos e busque pedidos por número</small>
  </div>
  <button class='btn manage-new-btn' onclick='abrirModal()'>+ Novo Produto</button>
 </div>

 <div class='admin-orders-box'>
  <div class='admin-orders-head'>
   <h3>📦 Pedidos</h3>
   <span>${pedidos.length} registrado(s)</span>
  </div>
  <input id='pedidoBusca' placeholder='Buscar pedido por número (ex: PED-984956)' value='${filtroPedidoAdmin}' oninput='atualizarBuscaPedido()'>
  <div id='pedidoResultados' class='pedido-list'></div>
 </div>

 <div class='cat-box'>
  <div class='cat-head'>
   <b>📂 Categorias</b>
   <button class='cat-new-btn' onclick='novaCategoria()'>+ Nova</button>
  </div>
  <div class='cat-list' id='cats'></div>
 </div>

 <div class='manage-toolbar'>
  <input id='manageBusca' placeholder='Buscar no catálogo (nome, descrição...)' value='${filtroGerenciarTexto}' oninput='atualizarGerenciamento()'>
  <select id='manageCat' onchange='atualizarGerenciamento()'>
    <option value=''>Todas as categorias</option>
    ${categorias.map(c=>`<option value='${c}' ${filtroGerenciarCategoria===c?'selected':''}>${c}</option>`).join('')}
  </select>
 </div>

 <div id='manageResultados'></div>`;
 tela.innerHTML=html;
 renderPedidosAdmin();
 renderCategorias();
 renderGerenciamentoAgrupado();
}

function atualizarBuscaPedido(){
 filtroPedidoAdmin = (document.getElementById('pedidoBusca')?.value || '').trim().toUpperCase();
 renderPedidosAdmin();
}

function renderPedidosAdmin(){
 const container = document.getElementById('pedidoResultados');
 if(!container) return;

 const lista = pedidos.filter(p=>{
  const numero = (p.numero || '').toUpperCase();
  const nome = (p.cliente?.nome || '').toUpperCase();
  return !filtroPedidoAdmin || numero.includes(filtroPedidoAdmin) || nome.includes(filtroPedidoAdmin);
 });

 if(!lista.length){
  container.innerHTML = `<div class='pedido-empty'>Nenhum pedido encontrado.</div>`;
  return;
 }

 container.innerHTML = lista.slice(0, 30).map(p=>`
  <div class='pedido-item'>
   <div class='pedido-info'>
    <strong>${p.numero}</strong>
    <small>${p.data} • ${p.cliente?.nome || 'Cliente não informado'}</small>
    <small>Total parcial: ${formatarMoeda(p.totalParcial || 0)}</small>
   </div>
   <button class='icon-btn view' onclick="verPedido('${p.numero}')" title='Ver pedido'>👁</button>
  </div>
 `).join('');
}

function verPedido(numeroPedido){
 const pedido = pedidos.find(p=>p.numero === numeroPedido);
 if(!pedido) return;
 const itens = (pedido.itens || []).map(i=>`- ${i.nome} | ${formatarMoeda(i.valor)}`).join('\n');
 alert(
  `Pedido: ${pedido.numero}\n` +
  `Data: ${pedido.data}\n` +
  `Cliente: ${pedido.cliente?.nome || '-'}\n` +
  `Contato: ${pedido.cliente?.contato || '-'}\n` +
  `Pagamento: ${pedido.cliente?.formaPagamento || '-'}\n` +
  `Endereço: ${pedido.cliente?.endereco || '-'}\n\n` +
  `Itens:\n${itens}\n\n` +
  `Total parcial: ${formatarMoeda(pedido.totalParcial || 0)}`
 );
}

function atualizarGerenciamento(){
 filtroGerenciarTexto = (document.getElementById('manageBusca')?.value || '').trim().toLowerCase();
 filtroGerenciarCategoria = (document.getElementById('manageCat')?.value || '').trim();
 renderGerenciamentoAgrupado();
}

function renderGerenciamentoAgrupado(){
 const container = document.getElementById('manageResultados');
 if(!container) return;

 const filtrados = produtos
  .map((p, i) => ({produto:p, index:i}))
  .filter(({produto}) => {
    const nome = (produto.nome || '').toLowerCase();
    const desc = (produto.descricao || '').toLowerCase();
    const cat = (produto.categoria || '').toLowerCase();
    const atendeTexto = !filtroGerenciarTexto || nome.includes(filtroGerenciarTexto) || desc.includes(filtroGerenciarTexto) || cat.includes(filtroGerenciarTexto);
    const atendeCategoria = !filtroGerenciarCategoria || (produto.categoria || '') === filtroGerenciarCategoria;
    return atendeTexto && atendeCategoria;
  });

 if(filtrados.length === 0){
  container.innerHTML = `<div class='manage-empty'>Nenhum produto encontrado com os filtros atuais.</div>`;
  return;
 }

 const grupos = {};
 filtrados.forEach(item=>{
  const categoria = item.produto.categoria || 'Sem categoria';
  if(!grupos[categoria]) grupos[categoria] = [];
  grupos[categoria].push(item);
 });

 const ordemCategorias = [...categorias, ...Object.keys(grupos).filter(c=>!categorias.includes(c))];
 let html = '';

 ordemCategorias.forEach(categoria=>{
  const itens = grupos[categoria];
  if(!itens || !itens.length) return;

  html += `<section class='manage-group'>
   <div class='manage-group-head'>
    <h3>${categoria}</h3>
    <span>${itens.length} produto(s)</span>
   </div>
   <div class='manage-list'>`;

  itens.forEach(({produto, index})=>{
    const img = (produto.imagens && produto.imagens[0]) ? produto.imagens[0] : DEFAULT_PRODUCT_IMAGE;
    const valor = produto.promo || produto.preco || 0;
    html+=`<div class='manage-item'>
     <div class='manage-left'>
      <img class='manage-thumb' src='${img}' onerror="this.onerror=null;this.src='${DEFAULT_PRODUCT_IMAGE}'">
      <div class='manage-info'>
        <div class='manage-title'>${produto.nome||''}</div>
        <small class='manage-sub'>${produto.categoria||'Sem categoria'}</small>
        <div class='manage-price'>${formatarMoeda(valor)}</div>
      </div>
     </div>
     <div class='manage-actions'>
      <button class='icon-btn view' onclick='visualizarProduto(${index})' title='Visualizar'>👁</button>
      <button class='icon-btn edit' onclick='editar(${index})' title='Editar'>✏</button>
      <button class='icon-btn del' onclick='excluir(${index})' title='Excluir'>🗑</button>
     </div>
    </div>`;
  });

  html += `</div></section>`;
 });

 container.innerHTML = html;
}

function novaCategoria(){
 const nome = prompt('Nova categoria'); if(!nome) return;
 if(categorias.includes(nome)){ alert('Já existe'); return; }
 categorias.push(nome); salvar(); renderCategorias();
}

function toggleNovaCategoria(){
 const box = document.getElementById('novaCatBox');
 box.style.display = box.style.display==='flex' ? 'none' : 'flex';
}

function salvarNovaCategoria(){
 const input = document.getElementById('novaCategoriaInput');
 const nome = input.value.trim();
 if(!nome) return;
 if(!categorias.includes(nome)) categorias.push(nome);
 salvar();
 atualizarSelectCategorias();
 document.getElementById('categoria').value = nome;
 input.value='';
 document.getElementById('novaCatBox').style.display='none';
}

function atualizarSelectCategorias(){
 const select = document.getElementById('categoria');
 if(!select) return;
 select.innerHTML = '<option value="">Selecione uma categoria</option>' + categorias.map(c=>`<option>${c}</option>`).join('');
}

function renderCategorias(){
 const div=document.getElementById('cats'); if(!div) return;
 div.innerHTML=categorias.map(c=>{
   const total = produtos.filter(p=>p.categoria===c).length;
   return `<div class='cat'>${c} (${total})</div>`;
 }).join('');
}

function excluir(i){ 
 produtos.splice(i,1); 
 limparCategoriasNaoUsadas();
 salvar(); 
 abrirGerenciar(); 
}

verProdutos(); renderCarrinho();

// ===== MODAL CADASTRO PRODUTO =====
const modalHTML = `
<div id="modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:20">
  <div style="background:#fff;padding:20px;border-radius:12px;width:95%;max-width:420px">
    <h3>Novo Produto</h3>

    <input type="file" id="imgInput" multiple accept="image/*"><br><br>

    <input id="nome" placeholder="Nome do Produto *" style="width:100%;padding:8px"><br><br>

    <textarea id="desc" placeholder="Descrição" style="width:100%;padding:8px"></textarea><br><br>

    <input id="preco" placeholder="Preço (R$) *" style="width:100%;padding:8px"><br><br>

    <div style="display:flex;flex-direction:column;gap:6px">
  <div style="display:flex;gap:6px">
    <select id="categoria" style="width:100%;padding:8px"></select>
    <button onclick="toggleNovaCategoria()" type="button" style="padding:6px 10px">+</button>
  </div>
  <div id="novaCatBox" style="display:none;gap:6px">
    <input id="novaCategoriaInput" placeholder="Nova categoria" style="flex:1;padding:8px">
    <button onclick="salvarNovaCategoria()" type="button">OK</button>
  </div>
</div><br><br>

    <select id="entrega" style="width:100%;padding:8px">
      <option value="">Modo de Entrega</option>
      <option>Retirada</option>
      <option>Entrega</option>
    </select><br><br>

    <input id="whats" placeholder="WhatsApp * (5511999999999)" style="width:100%;padding:8px"><br><br>

    <button class="btn" onclick="salvarProduto()">Adicionar Produto</button>
    <button class="btn" onclick="fecharModal()" style="background:#999">Cancelar</button>
  </div>
</div>`;

document.body.insertAdjacentHTML('beforeend', modalHTML);

function abrirModal(){ 
 document.getElementById('modal').style.display='flex';
 atualizarSelectCategorias();
}
function fecharModal(){ 
 document.getElementById('modal').style.display='none';
 limparCampos();
}

function limparCampos(){
 document.getElementById('nome').value='';
 document.getElementById('preco').value='';
 document.getElementById('categoria').value='';
 document.getElementById('entrega').value='';
 document.getElementById('whats').value='';
 document.getElementById('desc').value='';
 document.getElementById('imgInput').value='';
}

let editIndex = null;

function salvarProduto(){
 const nome = document.getElementById('nome').value;
 const preco = document.getElementById('preco').value;
 const categoria = document.getElementById('categoria').value;
 const entrega = document.getElementById('entrega').value;
 const whats = document.getElementById('whats').value;
 const desc = document.getElementById('desc').value;
 const files = document.getElementById('imgInput').files;

 if(!nome || !preco || !whats){ alert('Preencha os obrigatórios'); return; }

 let imagens = [];
 if(files.length){
  for(let i=0;i<files.length && i<3;i++){
    imagens.push(URL.createObjectURL(files[i]));
  }
 }

 if(editIndex !== null){
  produtos[editIndex] = {nome,preco,categoria,entrega,whats,descricao:desc,imagens};
  editIndex = null;
} else {
  produtos.push({nome,preco,categoria,entrega,whats,descricao:desc,imagens});
}
 limparCategoriasNaoUsadas();
 salvar();
 fecharModal();
 abrirGerenciar();
}

function limparCategoriasNaoUsadas(){
 categorias = categorias.filter(cat => produtos.some(p => p.categoria === cat));
}

function visualizarProduto(i){
 const p = produtos[i];
 if(!p) return;
 const valor = formatarMoeda(p.promo || p.preco || 0);
 alert(`Produto: ${p.nome || '-'}\nCategoria: ${p.categoria || 'Sem categoria'}\nPreço: ${valor}\nDescrição: ${p.descricao || '-'}`);
}

function editar(i){
 const p = produtos[i];
 editIndex = i;
 abrirModal();

 document.getElementById('nome').value = p.nome || '';
 document.getElementById('preco').value = p.preco || '';
 document.getElementById('categoria').value = p.categoria || '';
 document.getElementById('entrega').value = p.entrega || '';
 document.getElementById('whats').value = p.whats || '';
 document.getElementById('desc').value = p.descricao || '';
}

