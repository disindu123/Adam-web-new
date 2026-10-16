import { z } from 'zod';

export const documentId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const cleanText = (max) => z.string().trim().min(1).max(max);
const webUrl = z.string().max(2048).refine((value) => {
  if (!value) return true;
  try { return new URL(value).protocol === 'https:' && !new URL(value).username && !new URL(value).password; }
  catch { return false; }
}, 'Use a valid HTTPS URL.');
const imageUrl = webUrl.refine(value => !value || new URL(value).pathname.match(/\.(png|jpe?g|webp|gif|avif)$/i) || new URL(value).hostname === 'picsum.photos' || new URL(value).hostname === 'images.unsplash.com', 'Use a direct HTTPS image URL.');

export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(256) }).strict();
export const messageSchema = z.object({
  name: cleanText(100), email: z.email().max(254), subject: z.string().trim().max(160).default(''),
  message: cleanText(5000).min(10, 'Please write at least 10 characters.'),
  website: z.string().max(300).default('')
}).strict();
export const projectSchema = z.object({
  title: cleanText(100), description: cleanText(1600), category: z.enum(['web', 'security', 'tool']),
  technologies: z.array(cleanText(35)).max(12), imageUrl: imageUrl.default(''),
  liveUrl: webUrl.default(''), codeUrl: webUrl.default(''),
  published: z.boolean(), featured: z.boolean().default(false),
  order: z.number().int().min(0).max(9999).default(0)
}).strict();
export const messageUpdateSchema = z.object({ status: z.enum(['unread', 'read', 'replied', 'archived']) }).strict();
export const settingsSchema = z.object({
  maintenanceEnabled: z.boolean(), maintenanceTitle: cleanText(100),
  maintenanceMessage: cleanText(1000),
  maintenanceUntil: z.union([z.literal(''), z.iso.datetime({ offset: true })]).default('')
}).strict();
export const defaultSettings = {
  maintenanceEnabled: false,
  maintenanceTitle: 'SYSTEM UPGRADE IN PROGRESS',
  maintenanceMessage: 'Dark Adam is getting an upgrade. The portfolio will be back shortly. Thank you for your patience.',
  maintenanceUntil: ''
};

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const error = new Error(result.error.issues[0]?.message || 'Invalid request.');
    error.status = 400;
    throw error;
  }
  return result.data;
}
