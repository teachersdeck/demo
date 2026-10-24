/* Board Assignments (StudentDeck v0.17.0): DrawDeck scope step D ("student boards").
   A teacher pushes a DrawDeck page to the class; each student gets their OWN copy here to draw an
   answer on top of — a small pen + eraser canvas, NOT DrawDeck itself (no shapes, text, mind maps:
   this widget exists only to answer what the teacher pushed). The teacher reviews every submission
   in TeachersDeck's Board Assignments widget and awards XP there; this widget never awards XP itself.
   Everything stays local until Submit — the flattened picture (background + strokes) is what's sent.
   It is wrapped in a function so it adds one global, renderBoardAssign, and cannot clash with app.js.
   It uses these app.js globals at run time (never while loading): toast, esc, SDCloud. */
(function () {
  'use strict';

  const MAX_W = 1400; // the working canvas never exceeds this on its long side, so a big photo stays a reasonable upload
  const COLORS = ['#1a1a1a', '#e53935', '#1e88e5', '#2e7d32', '#f9a825'];
  const BA_STATUS = {
    open: { en: 'Not started yet' },
    submitted: { en: 'Submitted — waiting for your teacher' },
  };
  function statusLabel(a, ans) {
    if (ans && ans.awarded) return 'Graded — +' + (ans.awardedAmount || 0) + ' XP!';
    if (ans) return BA_STATUS.submitted.en;
    if (a.open === false) return 'Closed';
    return BA_STATUS.open.en;
  }

  window.renderBoardAssign = function renderBoardAssign(body) {
    const S = {
      alive: true, view: 'list', assignments: [], answers: {}, unsubA: null, unsubB: null,
      draw: null, // { id, title, bgImg, natW, natH, strokes, undone, tool, color, size, submitting }
    };
    const q = (s, r = body) => r.querySelector(s);

    function myAnswer(id) { return S.answers[id] || null; }

    /* ----- list view ----- */
    function renderList() {
      S.view = 'list';
      const rows = S.assignments.map((a) => {
        const ans = myAnswer(a.id), st = statusLabel(a, ans), graded = ans && ans.awarded, locked = graded || a.open === false;
        return '<button type="button" class="ba-card" data-open="' + esc(a.id) + '"' + (locked && !graded ? ' disabled' : '') + '>' +
          '<img alt="" src="' + esc(a.thumbDataUrl || '') + '">' +
          '<span class="ba-meta"><b>' + esc(a.title || '') + '</b><span class="ba-status' + (graded ? ' ba-graded' : '') + '">' + esc(st) + '</span></span>' +
          '</button>';
      }).join('');
      body.innerHTML = '<div class="ba-wrap"><p class="muted" style="margin:0 0 8px">Pages your teacher shared for you to answer.</p>' +
        '<div class="ba-list">' + (rows || '<p class="muted">Nothing here yet.</p>') + '</div></div>';
      body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
        const a = S.assignments.find((x) => x.id === b.dataset.open);
        const ans = myAnswer(b.dataset.open);
        if (a && !(ans && ans.awarded)) openDraw(a);
      }));
    }

    /* ----- draw view ----- */
    async function openDraw(a) {
      S.view = 'draw';
      body.innerHTML = '<div class="ba-wrap"><p class="muted">Loading…</p></div>';
      let url = null;
      try { url = await SDCloud.getBoardAssignmentImage(a.id); } catch (e) { /* handled below */ }
      if (!S.alive) return;
      if (!url) { toast('Couldn’t open that page — try again.'); renderList(); return; }
      const img = new Image();
      img.onload = () => { if (S.alive) startDraw(a, img); };
      img.onerror = () => { if (S.alive) { toast('Couldn’t open that page — try again.'); renderList(); } };
      img.src = url;
    }
    function startDraw(a, img) {
      const scale = Math.min(1, MAX_W / Math.max(img.naturalWidth, img.naturalHeight));
      const natW = Math.max(1, Math.round(img.naturalWidth * scale)), natH = Math.max(1, Math.round(img.naturalHeight * scale));
      S.draw = { id: a.id, title: a.title || '', bgImg: img, natW, natH, strokes: [], undone: [], tool: 'pen', color: COLORS[0], size: 6, submitting: false };
      body.innerHTML =
        '<div class="ba-draw">' +
        '<div class="ba-bar"><button type="button" class="btn" data-a="back">← Back</button><b class="ba-title"></b><span class="grow"></span>' +
        COLORS.map((c) => '<button type="button" class="ba-swatch' + (c === S.draw.color ? ' on' : '') + '" data-color="' + c + '" style="background:' + c + '" aria-label="Pen colour"></button>').join('') +
        '<button type="button" class="btn" data-a="erase">Eraser</button><button type="button" class="btn" data-a="undo">Undo</button><button type="button" class="btn" data-a="clear">Clear</button>' +
        '<button type="button" class="btn primary" data-a="submit">Submit</button></div>' +
        '<div class="ba-stage"><div class="ba-canwrap"><canvas class="ba-canvas"></canvas></div></div>' +
        '</div>';
      q('.ba-title').textContent = S.draw.title;
      const wrap = q('.ba-canwrap'); wrap.style.aspectRatio = natW + ' / ' + natH; wrap.style.backgroundImage = 'url(' + img.src + ')';
      const cv = q('.ba-canvas'); cv.width = natW; cv.height = natH;
      wireCanvas(cv);
      wireBar();
      updateBar();
    }
    function redraw(cv) {
      const cx = cv.getContext('2d');
      cx.clearRect(0, 0, cv.width, cv.height);
      S.draw.strokes.forEach((st) => paintStroke(cx, st));
    }
    function paintStroke(cx, st) {
      if (st.pts.length < 2) return;
      cx.save();
      cx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
      cx.strokeStyle = st.color; cx.lineWidth = st.size; cx.lineCap = 'round'; cx.lineJoin = 'round';
      cx.beginPath(); cx.moveTo(st.pts[0].x, st.pts[0].y);
      for (let i = 1; i < st.pts.length; i++) cx.lineTo(st.pts[i].x, st.pts[i].y);
      cx.stroke(); cx.restore();
    }
    function updateBar() {
      const d = S.draw; if (!d) return;
      body.querySelectorAll('.ba-swatch').forEach((b) => b.classList.toggle('on', b.dataset.color === d.color && d.tool === 'pen'));
      const eb = q('[data-a="erase"]'); if (eb) eb.classList.toggle('on', d.tool === 'erase');
      const ub = q('[data-a="undo"]'); if (ub) ub.disabled = !d.strokes.length;
      const sb = q('[data-a="submit"]'); if (sb) sb.disabled = d.submitting;
    }
    function wireCanvas(cv) {
      let live = null;
      const ptPos = (e) => { const r = cv.getBoundingClientRect(); const sx = cv.width / r.width, sy = cv.height / r.height; return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }; };
      cv.addEventListener('pointerdown', (e) => {
        if (!S.draw) return;
        cv.setPointerCapture(e.pointerId);
        live = { color: S.draw.color, size: S.draw.tool === 'erase' ? S.draw.size * 3 : S.draw.size, erase: S.draw.tool === 'erase', pts: [ptPos(e)] };
        S.draw.strokes.push(live); S.draw.undone = [];
      });
      cv.addEventListener('pointermove', (e) => {
        if (!live) return;
        live.pts.push(ptPos(e));
        paintStroke(cv.getContext('2d'), { ...live, pts: live.pts.slice(-2) });
      });
      function end() { if (live) { live = null; updateBar(); } }
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    }
    function wireBar() {
      body.addEventListener('click', onBarClick);
    }
    function onBarClick(e) {
      if (S.view !== 'draw' || !S.draw) return;
      const sw = e.target.closest('[data-color]');
      if (sw) { S.draw.tool = 'pen'; S.draw.color = sw.dataset.color; updateBar(); return; }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const cv = q('.ba-canvas');
      if (b.dataset.a === 'back') { body.removeEventListener('click', onBarClick); S.draw = null; renderList(); }
      else if (b.dataset.a === 'erase') { S.draw.tool = S.draw.tool === 'erase' ? 'pen' : 'erase'; updateBar(); }
      else if (b.dataset.a === 'undo') { const st = S.draw.strokes.pop(); if (st) S.draw.undone.push(st); if (cv) redraw(cv); updateBar(); }
      else if (b.dataset.a === 'clear') { if (S.draw.strokes.length && confirm('Clear everything you’ve drawn?')) { S.draw.strokes = []; S.draw.undone = []; if (cv) redraw(cv); updateBar(); } }
      else if (b.dataset.a === 'submit') submit();
    }
    async function submit() {
      const d = S.draw; if (!d || d.submitting) return;
      d.submitting = true; updateBar();
      try {
        const full = document.createElement('canvas'); full.width = d.natW; full.height = d.natH;
        const fc = full.getContext('2d'); fc.drawImage(d.bgImg, 0, 0, d.natW, d.natH); fc.drawImage(q('.ba-canvas'), 0, 0);
        const thumbScale = Math.min(1, 300 / Math.max(d.natW, d.natH));
        const thumb = document.createElement('canvas'); thumb.width = Math.round(d.natW * thumbScale); thumb.height = Math.round(d.natH * thumbScale);
        thumb.getContext('2d').drawImage(full, 0, 0, thumb.width, thumb.height);
        await SDCloud.submitBoardAnswer({ assignmentId: d.id, imageDataUrl: full.toDataURL('image/jpeg', 0.82), thumbDataUrl: thumb.toDataURL('image/jpeg', 0.7) });
        toast('Submitted — nice work!');
        body.removeEventListener('click', onBarClick); S.draw = null; renderList();
      } catch (e) {
        toast('Couldn’t submit: ' + (e.message || e)); d.submitting = false; updateBar();
      }
    }

    if (typeof SDCloud !== 'undefined' && typeof SDCloud.subscribeBoardAssignments === 'function') {
      try { S.unsubA = SDCloud.subscribeBoardAssignments((list) => { S.assignments = list; if (S.view === 'list') renderList(); }); } catch (e) {}
    }
    if (typeof SDCloud !== 'undefined' && typeof SDCloud.subscribeMyBoardAnswers === 'function') {
      try { S.unsubB = SDCloud.subscribeMyBoardAnswers((list) => { const m = {}; list.forEach((a) => { m[a.id] = a; }); S.answers = m; if (S.view === 'list') renderList(); }); } catch (e) {}
    }
    renderList();

    return function cleanup() {
      S.alive = false;
      if (S.unsubA) { try { S.unsubA(); } catch (e) {} }
      if (S.unsubB) { try { S.unsubB(); } catch (e) {} }
      body.removeEventListener('click', onBarClick);
    };
  };
})();
