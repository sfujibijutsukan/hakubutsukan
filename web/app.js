'use strict';
const $ = (id) => document.getElementById(id);
let catalog = null;
let category = 'すべて';
let favoritesOnly = false;
let favorites = new Set();
let fetching = false;
try { const saved = JSON.parse(localStorage.getItem('hakubutsukan.favorites') || '[]'); if (Array.isArray(saved)) favorites = new Set(saved.filter(x => typeof x === 'string')); } catch (_) { /* Storage can be unavailable in private browsers. */ }

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function safeURL(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; }
}
function saveFavorites() { try { localStorage.setItem('hakubutsukan.favorites', JSON.stringify([...favorites])); } catch (_) {} }
function status(exhibit) {
  if (exhibit.state !== 'running') return ['stopped', '停止中'];
  if (exhibit.health === 'unhealthy') return ['unhealthy', '要確認'];
  if (exhibit.health === 'starting') return ['starting', '準備中'];
  if (exhibit.health === 'healthy') return ['healthy', '正常'];
  return ['running', '起動中'];
}
function renderCategories() {
  const focused = $('categories').contains(document.activeElement) ? document.activeElement.textContent : null;
  const categories = ['すべて', ...new Set(catalog.exhibits.map(e => e.category))];
  if (!categories.includes(category)) category = 'すべて';
  $('categories').replaceChildren(...categories.map(name => {
    const button = element('button', 'filter', name);
    button.setAttribute('aria-pressed', String(category === name));
    button.onclick = () => { category = name; renderCategories(); render(); };
    return button;
  }));
  if (focused) [...$('categories').children].find(button => button.textContent === focused)?.focus();
}
function card(e, index) {
  const article = element('article', `card tone-${index % 5}`);
  const top = element('div', 'card-top');
  const icon = element('span', 'card-icon', e.icon);
  icon.setAttribute('aria-hidden', 'true');
  const favorite = element('button', 'favorite', favorites.has(e.id) ? '★' : '☆');
  favorite.setAttribute('aria-label', `${e.name}のお気に入り`);
  favorite.setAttribute('aria-pressed', String(favorites.has(e.id)));
  favorite.onclick = () => {
    const active = document.activeElement === favorite;
    favorites.has(e.id) ? favorites.delete(e.id) : favorites.add(e.id);
    saveFavorites(); render();
    if (active) {
      const replacement = [...$('grid').querySelectorAll('.favorite')].find(b => b.getAttribute('aria-label') === `${e.name}のお気に入り`);
      (replacement || $('favorites')).focus();
    }
  };
  top.append(icon, favorite);
  const preview = /^\/previews\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.(png|jpg|jpeg|webp)$/.test(e.preview || '') ? e.preview : '';
  if (preview) {
    const image = element('img', 'card-preview');
    image.alt = `${e.name}の画面プレビュー（撮影時点）`;
    image.loading = 'lazy'; image.decoding = 'async';
    image.onload = () => top.classList.add('has-preview');
    image.onerror = () => { image.remove(); top.classList.remove('has-preview'); };
    image.src = preview; top.prepend(image);
  }
  const body = element('div', 'card-body');
  body.append(element('h2', '', e.name));
  if (e.description) body.append(element('p', 'description', e.description));
  const bottom = element('div', 'card-bottom');
  const [state, label] = status(e);
  const badge = element('span', `status ${catalog.stale ? 'unknown' : state}`, catalog.stale ? '状態未確認' : label);
  bottom.append(badge);
  const url = safeURL(e.url);
  if (url) {
    const link = element('a', 'open-link', '開く ↗');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${e.name}を開く（新しいタブ）`);
    bottom.append(link);
  } else { bottom.append(element('span', 'no-url', 'URL未設定')); }
  article.append(top, body, bottom);
  return article;
}
function render() {
  if (!catalog) return;
  const query = $('search').value.trim().toLocaleLowerCase();
  const visible = catalog.exhibits.filter(e => (category === 'すべて' || e.category === category) && (!favoritesOnly || favorites.has(e.id)) && `${e.name} ${e.description} ${e.category}`.toLocaleLowerCase().includes(query));
  $('grid').replaceChildren(...visible.map((e) => card(e, catalog.exhibits.indexOf(e))));
  $('grid').setAttribute('aria-busy', 'false');
  $('count').textContent = String(catalog.exhibits.length).padStart(2, '0');
  $('result-count').textContent = visible.length === catalog.exhibits.length ? '' : `${visible.length} 件`;
  $('empty').hidden = visible.length !== 0;
  const noExhibits = catalog.exhibits.length === 0;
  $('empty-title').textContent = noExhibits ? '展示がありません' : '展示が見つかりませんでした';
  $('empty-copy').textContent = '';
  $('reset').hidden = noExhibits;
}
async function refresh() {
  if (fetching) return;
  fetching = true;
  try {
    const response = await fetch('/api/catalog', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('catalog unavailable');
    const data = await response.json();
    if (!Array.isArray(data.exhibits)) throw new Error('invalid catalog');
    const changed = !catalog || JSON.stringify(data.exhibits) !== JSON.stringify(catalog.exhibits) || data.stale !== catalog.stale;
    catalog = data;
    const notices = [];
    if (catalog.demo) notices.push('デモ');
    if (catalog.stale) notices.push(catalog.message || 'サービス情報を更新できません。前回の展示を表示しています。');
    $('notice').textContent = notices.join(' '); $('notice').hidden = notices.length === 0;
    $('notice').className = catalog.demo && !catalog.stale ? 'notice demo' : 'notice';
    const updated = new Date(catalog.updatedAt);
    $('updated').textContent = updated.getFullYear() > 2000 ? `${new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(updated)} 更新` : '';
    const dockge = safeURL(catalog.dockgeUrl);
    $('dockge').hidden = !dockge; if (dockge) $('dockge').href = dockge;
    if (changed) { renderCategories(); render(); }
  } catch (_) {
    $('notice').className = 'notice';
    $('notice').textContent = '展示情報に接続できません。自動で再接続します。'; $('notice').hidden = false;
    $('grid').setAttribute('aria-busy', 'false');
    if (catalog) { catalog.stale = true; render(); }
    else { $('empty').hidden = false; $('empty-title').textContent = '展示情報を取得できません'; $('empty-copy').textContent = 'しばらくすると自動で再接続します。'; $('reset').hidden = true; }
  } finally { fetching = false; }
}
$('search').addEventListener('input', render);
$('favorites').onclick = () => { favoritesOnly = !favoritesOnly; $('favorites').setAttribute('aria-pressed', String(favoritesOnly)); $('favorites').textContent = favoritesOnly ? '★ お気に入り' : '☆ お気に入り'; render(); };
$('reset').onclick = () => { category = 'すべて'; favoritesOnly = false; $('search').value = ''; $('favorites').setAttribute('aria-pressed', 'false'); $('favorites').textContent = '☆ お気に入り'; renderCategories(); render(); };
document.addEventListener('keydown', event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('search').focus(); } });
refresh(); setInterval(refresh, 15000);
