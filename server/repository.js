import { FieldValue } from 'firebase-admin/firestore';
import { defaultSettings, defaultSocialLinks } from './validation.js';

function serialize(doc) {
  const data = doc.data();
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value.toDate === 'function') data[key] = value.toDate().toISOString();
  }
  return { ...data, id: doc.id };
}

export class FirestoreRepository {
  constructor(db) { this.db = db; }
  async health() { await this.db.doc('settings/site').get(); }
  async getSettings() {
    const doc = await this.db.doc('settings/site').get();
    return { ...defaultSettings, ...(doc.exists ? doc.data() : {}) };
  }
  async setSettings(settings, uid) {
    await this.db.doc('settings/site').set({ ...settings, updatedBy: uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return settings;
  }
  async getSocialLinks() {
    const doc = await this.db.doc('settings/social').get();
    const data = doc.exists ? doc.data() : {};
    return Object.fromEntries(Object.keys(defaultSocialLinks).map(key => [key, typeof data[key] === 'string' ? data[key] : defaultSocialLinks[key]]));
  }
  async setSocialLinks(links, uid) {
    await this.db.doc('settings/social').set({ ...links, updatedBy: uid, updatedAt: FieldValue.serverTimestamp() });
    return links;
  }
  async listProjects(publicOnly = false) {
    let query = this.db.collection('projects');
    if (publicOnly) query = query.where('published', '==', true);
    const snapshot = await query.get();
    return snapshot.docs.map(serialize).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }
  async createProject(data, uid) {
    const ref = await this.db.collection('projects').add({ ...data, createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return serialize(await ref.get());
  }
  async updateProject(id, data, uid) {
    const ref = this.db.collection('projects').doc(id);
    try { await ref.update({ ...data, updatedBy: uid, updatedAt: FieldValue.serverTimestamp() }); }
    catch (error) { if (error.code === 5) return null; throw error; }
    return serialize(await ref.get());
  }
  async deleteProject(id) { await this.db.collection('projects').doc(id).delete(); }
  async createMessage(data) {
    const ref = await this.db.collection('messages').add({ ...data, status: 'unread', createdAt: FieldValue.serverTimestamp() });
    return ref.id;
  }
  async listMessages(cursor) {
    let query = this.db.collection('messages').orderBy('createdAt', 'desc');
    if (cursor) {
      const doc = await this.db.collection('messages').doc(cursor).get();
      if (!doc.exists) { const error = new Error('Message cursor no longer exists. Refresh the inbox.'); error.status = 400; throw error; }
      query = query.startAfter(doc);
    }
    const snapshot = await query.limit(51).get();
    const page = snapshot.docs.slice(0, 50);
    return { messages: page.map(serialize), nextCursor: snapshot.size > 50 ? page.at(-1).id : null };
  }
  async updateMessage(id, status) {
    const ref = this.db.collection('messages').doc(id);
    try { await ref.update({ status, updatedAt: FieldValue.serverTimestamp() }); }
    catch (error) { if (error.code === 5) return null; throw error; }
    return serialize(await ref.get());
  }
  async deleteMessage(id) { await this.db.collection('messages').doc(id).delete(); }
  async getStats() {
    const [projects, published, messages, unread] = await Promise.all([
      this.db.collection('projects').count().get(),
      this.db.collection('projects').where('published', '==', true).count().get(),
      this.db.collection('messages').count().get(),
      this.db.collection('messages').where('status', '==', 'unread').count().get()
    ]);
    return { projects: projects.data().count, published: published.data().count, messages: messages.data().count, unread: unread.data().count };
  }
}

