/* adminPushTheme — AdminDeck v0.5.0 reference copy, for trifecta-firebase-backend v1.5.0.
   THE BACKEND PACKAGE IS THE SOURCE OF TRUTH: copy this into the backend's functions/src/ (next to adminDeck.js), export
   `adminPushTheme` from its index.js, and deploy:
       firebase deploy --only functions:adminPushTheme
   Same secret (ADMINDECK_SECRET), same auth, same CORS as adminListClasses / adminGetClass / adminGetSchoolStats. Admin SDK.

   THE FIRST WRITE IN ADMINDECK. Everything else in AdminDeck only reads. This function writes exactly one document per target class:
       classes/{classId}/adminTheme/current   = { preset | image, dim, version, pushedAt, pushedBy: 'AdminDeck' }
   It never touches the class document itself, a student, a roster, points, homework or an event. Why a sub-document rather than a field
   on the class: StudentDeck and ParentDeck read the class document, and a background photo (up to ~700 KB) would be downloaded by every
   student and parent. TeachersDeck v0.15.2 reads the sub-document, once per push.

   ONE FIRESTORE RULE IS NEEDED (the Admin SDK ignores rules, so this function works without it, but TeachersDeck's read is refused
   without it — default deny). Add inside the classes match in firestore.rules, using the backend's own "teacher owns this class" helper:
       match /adminTheme/{doc} {
         allow read: if request.auth != null
           && get(/databases/$(database)/documents/classes/$(classId)).data.teacherUid == request.auth.uid;
         allow write: if false;
       }

   Body (POST, JSON): { classIds: 'all' | [classId, ...] (max 500), theme: { preset: 'dusk'|'chalk'|'ocean'|'sunrise'|'slate'|'plain' | null,
                        image: 'data:image/jpeg|png|webp;base64,...' | null  (exactly one of preset / image; image <= 700000 chars),
                        dim: boolean, version: number (ms; TeachersDeck applies each version once) } }
   Returns { updated: number, missing: [classId], failed: [classId] }. A classId that does not exist is reported in `missing`, not created. */
'use strict';

const PRESET_IDS = ['dusk', 'chalk', 'ocean', 'sunrise', 'slate', 'plain'];
const MAX_IMAGE_CHARS = 700000;
const MAX_CLASSES = 500;
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/* Pure. Returns { ok:true, theme, classIds } (classIds === null means every class) or { ok:false, error }. */
function validatePush(body) {
  body = body || {};
  const t = body.theme;
  if (!t || typeof t !== 'object') return { ok: false, error: 'theme is required' };
  const hasPreset = t.preset !== null && t.preset !== undefined, hasImage = t.image !== null && t.image !== undefined;
  if (hasPreset === hasImage) return { ok: false, error: 'send exactly one of theme.preset or theme.image' };
  if (hasPreset && !PRESET_IDS.includes(t.preset)) return { ok: false, error: 'unknown preset' };
  if (hasImage && (typeof t.image !== 'string' || t.image.length > MAX_IMAGE_CHARS || !IMAGE_RE.test(t.image))) return { ok: false, error: 'theme.image must be a jpeg, png or webp data URL of at most ' + MAX_IMAGE_CHARS + ' characters' };
  const version = Number(t.version);
  if (!isFinite(version) || version <= 0) return { ok: false, error: 'theme.version must be a positive number' };
  let classIds = null;
  if (body.classIds !== 'all') {
    if (!Array.isArray(body.classIds) || !body.classIds.length) return { ok: false, error: "classIds must be 'all' or a non-empty list" };
    if (body.classIds.length > MAX_CLASSES) return { ok: false, error: 'at most ' + MAX_CLASSES + ' classes per push' };
    if (!body.classIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128 && !id.includes('/'))) return { ok: false, error: 'classIds contains an invalid id' };
    classIds = Array.from(new Set(body.classIds));
  }
  return { ok: true, classIds, theme: { preset: hasPreset ? t.preset : null, image: hasImage ? t.image : null, dim: !!t.dim, version } };
}

/* Cloud Function factory — dependency-injected like makeAdminGetSchoolStats:
       const { makeAdminPushTheme } = require('./adminTheme');
       const adminPushTheme = makeAdminPushTheme({ onRequest, logger, db, FieldValue, secret: ADMINDECK_SECRET, handlePreflight, requireAdmin });
   (FieldValue comes from 'firebase-admin/firestore'.) */
function makeAdminPushTheme(deps) {
  const { onRequest, logger, db, FieldValue, secret, handlePreflight, requireAdmin } = deps;
  return onRequest({ secrets: [secret], timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
    if (!requireAdmin(req, res)) return;
    try {
      const v = validatePush(req.body);
      if (!v.ok) { res.status(400).json({ error: v.error }); return; }
      let ids = v.classIds;
      if (ids === null) ids = (await db.collection('classes').select().get()).docs.map((d) => d.id);   // select(): ids only, no class data read
      const missing = [], failed = []; let updated = 0;
      const doc = { preset: v.theme.preset, image: v.theme.image, dim: v.theme.dim, version: v.theme.version, pushedAt: FieldValue.serverTimestamp(), pushedBy: 'AdminDeck' };
      // Small batches: 10 classes x 700 KB stays well under Firestore's 10 MiB per-commit limit.
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        const refs = chunk.map((id) => db.collection('classes').doc(id));
        const snaps = await Promise.all(refs.map((r) => r.get()));
        const batch = db.batch(); let inBatch = 0; const inIds = [];
        snaps.forEach((s, k) => {
          if (!s.exists) { missing.push(chunk[k]); return; }
          batch.set(refs[k].collection('adminTheme').doc('current'), doc);
          inBatch++; inIds.push(chunk[k]);
        });
        if (!inBatch) continue;
        try { await batch.commit(); updated += inBatch; }
        catch (e) { logger.error('adminPushTheme: batch failed', inIds, e); failed.push(...inIds); }
      }
      logger.info('adminPushTheme', { updated, missing: missing.length, failed: failed.length, kind: v.theme.image ? 'image' : v.theme.preset });
      res.status(200).json({ updated, missing, failed });
    } catch (e) {
      logger.error('adminPushTheme failed', e);
      res.status(500).json({ error: 'Internal error pushing the theme' });
    }
  });
}

module.exports = { validatePush, makeAdminPushTheme, PRESET_IDS, MAX_IMAGE_CHARS, MAX_CLASSES };
