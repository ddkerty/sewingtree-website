/* linen_s_t · 쏘잉트리 — gallery.js (v2, 2026.11.05)
   ------------------------------------------------------------------
   - 필터·연도·검색·보기 방식은 주소창 쿼리(?tag=원피스&year=2024&q=린넨&view=photos)에,
     열려 있는 작품은 해시(#p=게시물ID-사진번호)에 기록한다 → 공유·북마크·뒤로가기가 동작
   - 그리드는 처음 20개, 더 보기 버튼을 누를 때만 20개씩 추가
   - 라이트박스: 로컬 대표 사진을 먼저 깔고 원본을 불러온다. 실패하면 대표 사진/안내로 대체
   - archive.json 은 원본 형식과 scripts/compact_archive.py 가 만드는 축약 형식 모두 읽는다
   ------------------------------------------------------------------ */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const PAGE = 20;          // 한 번에 추가하는 카드 수
  const BLOG = 'https://blog.naver.com/quiltkslee';
  const IMG_HOST = 'https://postfiles.pstatic.net/';
  const ALL = '전체';

  const state = {
    items: [], byId: new Map(),
    filter: ALL, year: 'all', query: '', view: 'posts',
    limit: PAGE,
    results: [],      // 현재 그리드에 표시 중인 {p, index} 목록
    order: [],        // 현재 조건의 작품 순서 (라이트박스 이전/다음 작품용)
    post: null, photo: 0,
    localPhotos: false,
    pushed: false     // 라이트박스를 열며 history 를 push 했는지
  };

  const gallery = $('#gallery');
  const dialog = $('#lightbox');
  const visual = $('#modal-visual');
  const image = $('#modal-image');
  const placeholder = $('#modal-placeholder');
  const errorBox = $('#image-error');
  const fallbackNote = $('#fallback-note');
  const toolbar = $('#toolbar');
  const loadMore = $('#load-more');

  const fmt = n => n.toLocaleString('ko-KR');
  const tidy = s => String(s).toLowerCase().replace(/\s/g, '');
  const dots = d => String(d).replaceAll('-', '.');

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ---------- 자료 ---------- */
  function expand(src) {
    if (!src) return '';
    if (/^(https?:)?\/\//.test(src) || src.startsWith('assets/')) return src;
    return IMG_HOST + src;
  }
  function normalize(raw) {
    const id = String(raw.id ?? raw.i);
    const date = raw.date ?? raw.d ?? '';
    return {
      id,
      title: raw.title ?? raw.t ?? '',
      date,
      year: String(raw.year ?? raw.y ?? date.slice(0, 4)),
      tags: raw.tags ?? raw.g ?? [],
      images: (raw.images ?? raw.m ?? []).map(expand),
      thumb: raw.thumb ?? raw.h ?? `assets/archive/${id}.webp`,
      url: raw.url ?? raw.u ?? `${BLOG}/${id}`
    };
  }
  // 그리드/썸네일용 (가벼운 로컬 사진 우선)
  function photoSrc(p, i) {
    if (i === 0) return p.thumb;
    if (state.localPhotos) return `assets/photos/${p.id}_${i + 1}.webp`;
    return p.images[i];
  }
  function selection() {
    const q = tidy(state.query);
    return state.items.filter(p =>
      (state.filter === ALL || p.tags.includes(state.filter)) &&
      (state.year === 'all' || p.year === state.year) &&
      (!q || tidy(p.title).includes(q) || p.tags.some(t => tidy(t).includes(q)) || p.year.includes(q))
    );
  }

  /* ---------- 주소창 ---------- */
  function syncUrl() {
    const sp = new URLSearchParams();
    if (state.filter !== ALL) sp.set('tag', state.filter);
    if (state.year !== 'all') sp.set('year', state.year);
    if (state.query.trim()) sp.set('q', state.query.trim());
    if (state.view !== 'posts') sp.set('view', state.view);
    const qs = sp.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }
  function readUrl() {
    const sp = new URLSearchParams(location.search);
    const tag = sp.get('tag');
    if (tag && $$('[data-filter]').some(b => b.dataset.filter === tag)) state.filter = tag;
    if (sp.get('year')) state.year = sp.get('year');
    if (sp.get('q')) state.query = sp.get('q');
    if (sp.get('view') === 'photos') state.view = 'photos';
  }
  function parseHash() {
    const m = /^#p=(\d+)(?:-(\d+))?$/.exec(location.hash);
    return m ? { id: m[1], index: m[2] ? Math.max(0, Number(m[2]) - 1) : 0 } : null;
  }
  function postHash(p, i) { return `#p=${p.id}${i ? '-' + (i + 1) : ''}`; }

  /* ---------- 그리드 ---------- */
  function card(p, index) {
    const article = el('article', 'gallery-card');
    const n = p.images.length;
    const button = el('button', 'card-image');
    button.type = 'button';
    button.setAttribute('aria-label', `${p.title} — ${index + 1}번째 사진 크게 보기`);
    button.dataset.hint = state.view === 'posts' ? `사진 ${n}장 보기` : '크게 보기';

    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => img.classList.add('ready'), { once: true });
    img.addEventListener('error', () => {
      if (img.dataset.fallback) return;
      img.dataset.fallback = '1';
      img.classList.add('fallback');
      img.src = p.thumb;
      button.dataset.hint = '원본은 블로그에서';
      const label = button.querySelector('.image-count');
      if (label) label.textContent = '대표 사진으로 대체';
    }, { once: true });
    img.src = photoSrc(p, index);

    button.append(img, el('span', 'image-count', state.view === 'posts' ? `${n}장` : `${index + 1} / ${n}`));

    const caption = el('div', 'card-caption');
    const meta = el('div', '', `${p.tags.join(' · ')} · ${p.year}`);
    caption.append(meta, el('h3', '', p.title));

    article.append(button, caption);
    article.addEventListener('click', () => {
      button.focus({ preventScroll: true });
      openPost(p, index);
    });
    return article;
  }

  function renderSkeleton(n = 12) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const a = el('article', 'gallery-card skeleton');
      a.setAttribute('aria-hidden', 'true');
      const cap = el('div', 'card-caption');
      cap.append(el('div'), el('h3', '', ' '));
      a.append(el('div', 'card-image'), cap);
      frag.append(a);
    }
    gallery.replaceChildren(frag);
  }

  function render(reset = true) {
    if (reset) {
      state.limit = PAGE;
      gallery.replaceChildren();
    }
    const selected = selection();
    state.order = selected;
    state.results = state.view === 'posts'
      ? selected.map(p => ({ p, index: 0 }))
      : selected.flatMap(p => p.images.map((_, index) => ({ p, index })));

    const total = state.results.length;
    const count = Math.min(state.limit, total);
    const start = reset ? 0 : gallery.children.length;
    const frag = document.createDocumentFragment();
    for (let i = start; i < count; i++) frag.append(card(state.results[i].p, state.results[i].index));
    gallery.append(frag);

    const photos = selected.reduce((n, p) => n + p.images.length, 0);
    $('#results').textContent = state.view === 'posts'
      ? `${fmt(selected.length)}개의 기록 · ${fmt(photos)}장의 사진`
      : `${fmt(total)}장의 사진 · ${fmt(selected.length)}개의 기록`;

    const empty = total === 0;
    $('#empty').hidden = !empty;
    $('#empty-message').textContent = state.query.trim()
      ? `'${state.query.trim()}'에 해당하는 기록이 없습니다.`
      : '조건에 맞는 기록이 없습니다.';

    const unit = state.view === 'posts' ? '개' : '장';
    loadMore.hidden = count >= total;
    loadMore.textContent = state.view === 'posts' ? '기록 더 보기' : '사진 더 보기';
    $('#progress').textContent = !total ? ''
      : count >= total ? `${fmt(total)}${unit} 모두 표시했습니다.`
      : `${fmt(count)} / ${fmt(total)}${unit} 표시 중`;
  }

  function setFilterButtons() {
    $$('[data-filter]').forEach(b => {
      const on = b.dataset.filter === state.filter;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $$('[data-view]').forEach(b => {
      const on = b.dataset.view === state.view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('#search').value = state.query;
    $('#year').value = state.year;
    if ($('#year').value !== state.year) { state.year = 'all'; $('#year').value = 'all'; }
  }

  /* ---------- 라이트박스 ---------- */
  let loadToken = 0;
  let imageTimer;

  function neighborPost(dir) {
    const list = state.order.includes(state.post) ? state.order : state.items;
    return list[list.indexOf(state.post) + dir] || null;
  }

  function updatePostNav() {
    [['#prev-post', -1], ['#next-post', 1]].forEach(([sel, dir]) => {
      const b = $(sel);
      const n = neighborPost(dir);
      b.disabled = !n;
      b.querySelector('.post-nav-title').textContent = n ? n.title : '';
    });
  }

  function setPhoto(i) {
    const p = state.post;
    const n = p.images.length;
    state.photo = Math.min(Math.max(i, 0), n - 1);
    const src = p.images[state.photo];
    const token = ++loadToken;
    clearTimeout(imageTimer);

    visual.classList.remove('ready', 'failed');
    visual.classList.add('loading');
    errorBox.hidden = true;
    fallbackNote.hidden = true;
    placeholder.src = p.thumb;
    placeholder.classList.toggle('exact', state.photo === 0);
    image.alt = `${p.title} · ${state.photo + 1}번째 사진`;

    const loader = new Image();
    loader.referrerPolicy = 'no-referrer';
    loader.decoding = 'async';
    loader.onload = () => {
      if (token !== loadToken) return;
      clearTimeout(imageTimer);
      image.src = src;
      visual.classList.remove('loading');
      visual.classList.add('ready');
      // 다음 사진 미리 받기
      if (n > 1) { const pre = new Image(); pre.referrerPolicy = 'no-referrer'; pre.src = p.images[(state.photo + 1) % n]; }
    };
    loader.onerror = () => {
      if (token !== loadToken) return;
      clearTimeout(imageTimer);
      visual.classList.remove('loading');
      visual.classList.add('failed');
      if (state.photo === 0) {
        placeholder.classList.add('exact');
        fallbackNote.hidden = false;
      } else {
        $('#error-link').href = p.url;
        errorBox.hidden = false;
      }
    };
    imageTimer = setTimeout(() => loader.onerror(), 12000);
    loader.src = src;

    $('#photo-counter').textContent = `${state.photo + 1} / ${n}`;
    $('#previous').disabled = state.photo === 0 && !neighborPost(-1);
    $('#next').disabled = state.photo === n - 1 && !neighborPost(1);
    $$('#thumbnails button').forEach((b, k) => {
      const on = k === state.photo;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
      if (on) {
        const strip = $('#thumbnails');
        const rect = b.getBoundingClientRect(), bounds = strip.getBoundingClientRect();
        if (rect.left < bounds.left) strip.scrollLeft += rect.left - bounds.left;
        else if (rect.right > bounds.right) strip.scrollLeft += rect.right - bounds.right;
      }
    });
    if (dialog.open) history.replaceState(history.state, '', postHash(p, state.photo));
  }

  function buildThumbnails(p) {
    const wrap = $('#thumbnails');
    wrap.replaceChildren();
    p.images.forEach((_, i) => {
      const b = el('button');
      b.type = 'button';
      b.setAttribute('aria-label', `${i + 1}번째 사진 보기`);
      const img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { img.replaceWith(el('span', 'n', String(i + 1))); }, { once: true });
      img.src = photoSrc(p, i);
      b.append(img);
      b.addEventListener('click', () => setPhoto(i));
      wrap.append(b);
    });
  }

  function openPost(p, index = 0, { push = true } = {}) {
    const first = !dialog.open;
    state.post = p;
    $('#modal-title').textContent = p.title;
    $('#modal-date').textContent = dots(p.date);
    $('#modal-category').textContent = p.tags.join(' · ') + (p.year ? ` · ${p.year}년` : '');
    $('#original').href = p.url;
    buildThumbnails(p);
    updatePostNav();

    if (first) {
      dialog.showModal();
      document.body.classList.add('modal-open');
      $('.close-modal').focus();
      if (push) { history.pushState({ lightbox: true }, '', postHash(p, index)); state.pushed = true; }
      else history.replaceState(history.state, '', postHash(p, index));
    } else {
      $('.modal-layout').scrollTop = 0;
      history.replaceState(history.state, '', postHash(p, index));
    }
    setPhoto(index);
    $('.modal-layout').scrollTop = 0;
  }

  function step(dir) {
    const p = state.post;
    if (!p) return;
    const next = state.photo + dir;
    if (next >= 0 && next < p.images.length) { setPhoto(next); return; }
    const nb = neighborPost(dir);
    if (nb) openPost(nb, dir > 0 ? 0 : nb.images.length - 1, { push: false });
  }

  $('#copy-info').addEventListener('click', async e => {
    const p = state.post; if (!p) return;
    const text = `${p.title} (${dots(p.date)})\n${p.url}`;
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText(text); b.textContent = '복사했습니다'; }
    catch { b.textContent = '복사 실패'; }
    b.classList.add('copied');
    setTimeout(() => { b.textContent = '작품 정보 복사'; b.classList.remove('copied'); }, 1800);
  });
  $('.close-modal').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    loadToken++;
    clearTimeout(imageTimer);
    state.post = null;
    image.removeAttribute('src');
    if (state.pushed) { state.pushed = false; history.back(); }
    else if (parseHash()) history.replaceState(history.state, '', location.pathname + location.search);
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  $('#previous').addEventListener('click', () => step(-1));
  $('#next').addEventListener('click', () => step(1));
  $('#prev-post').addEventListener('click', () => { const n = neighborPost(-1); if (n) openPost(n, 0, { push: false }); });
  $('#next-post').addEventListener('click', () => { const n = neighborPost(1); if (n) openPost(n, 0, { push: false }); });
  dialog.addEventListener('keydown', e => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });

  // 스와이프 (가로 이동이 세로보다 클 때만)
  let tx = 0, ty = 0;
  visual.addEventListener('touchstart', e => { tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY; }, { passive: true });
  visual.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.addEventListener('popstate', () => {
    const h = parseHash();
    if (h && state.byId.has(h.id)) {
      const p = state.byId.get(h.id);
      openPost(p, Math.min(h.index, p.images.length - 1), { push: false });
      state.pushed = true;             // 앞으로 가기로 열린 경우: 닫을 때 뒤로 돌아간다
    } else if (dialog.open) {
      state.pushed = false;
      dialog.close();
    }
  });

  /* ---------- 툴바 ---------- */
  $$('[data-filter]').forEach(b => b.addEventListener('click', () => {
    state.filter = b.dataset.filter; setFilterButtons(); render(); syncUrl();
  }));
  $$('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view; setFilterButtons(); render(); syncUrl();
  }));
  $('#year').addEventListener('change', e => { state.year = e.target.value; render(); syncUrl(); });

  let searchTimer;
  $('#search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value; render(); syncUrl(); }, 140);
  });
  $('#reset').addEventListener('click', () => {
    clearTimeout(searchTimer);
    state.filter = ALL; state.year = 'all'; state.query = '';
    setFilterButtons(); render(); syncUrl();
    $('#search').focus();
  });

  loadMore.addEventListener('click', () => {
    state.limit += PAGE; render(false);
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      toolbar.classList.toggle('stuck', e.intersectionRatio < 1 && e.boundingClientRect.top <= 0);
    }, { threshold: [1], rootMargin: '-1px 0px 0px 0px' }).observe(toolbar);
  }

  /* ---------- 맨 위로 ---------- */
  const toTop = $('#to-top');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { toTop.hidden = window.scrollY < 1000; ticking = false; });
  }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---------- 히어로 ---------- */
  function renderHero(data) {
    const first = state.items[state.items.length - 1], last = state.items[0];
    const range = data.range || [first && first.year, last && last.year];
    $('#hero-stats').textContent =
      `${range[0]}–${range[1]} · ${fmt(data.posts || state.items.length)}개의 기록 · ${fmt(data.photos || state.items.reduce((n, p) => n + p.images.length, 0))}장의 사진`;
  }

  /* ---------- 시작 ---------- */
  let sectionNavigation = !!location.hash && !parseHash();
  function alignSection() {
    if (!sectionNavigation || parseHash()) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    sectionNavigation = true;
  });
  window.addEventListener('hashchange', () => {
    if (!parseHash()) sectionNavigation = true;
  });
  readUrl();
  renderSkeleton(PAGE);

  fetch('archive.json')
    .then(r => { if (!r.ok) throw Error('archive'); return r.json(); })
    .then(data => {
      state.items = (data.items || []).map(normalize);
      state.items.forEach(p => state.byId.set(p.id, p));
      state.localPhotos = !!data.localPhotos;

      const years = new Map();
      state.items.forEach(p => years.set(p.year, (years.get(p.year) || 0) + 1));
      [...years.keys()].filter(Boolean).sort().reverse().forEach(y => {
        const o = el('option', '', `${y}년`);
        o.value = y;
        $('#year').append(o);
      });

      setFilterButtons();
      render();
      renderHero(data);
      if (sectionNavigation) {
        document.fonts.ready.then(() => requestAnimationFrame(alignSection));
      }

      const h = parseHash();
      if (h && state.byId.has(h.id)) {
        const p = state.byId.get(h.id);
        openPost(p, Math.min(h.index, p.images.length - 1), { push: false });
      }
    })
    .catch(() => {
      $('#results').textContent = '기록을 불러오지 못했습니다.';
      const p = el('p', '', '새로고침하거나 공식 블로그에서 작품을 확인해 주세요.');
      const a = el('a', 'underlink', '공식 블로그에서 보기 ↗');
      a.href = BLOG;
      gallery.replaceChildren(p, a);
      $('#progress').textContent = '';
      alignSection();
    });
})();
