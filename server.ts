import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email?: string;
    emailVerified?: boolean;
  };
}

let cachedFirebaseApiKey: string | null = null;
function getFirebaseWebApiKey(): string {
  if (cachedFirebaseApiKey) return cachedFirebaseApiKey;
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { apiKey?: string };
    if (typeof parsed.apiKey === 'string' && parsed.apiKey.trim()) {
      cachedFirebaseApiKey = parsed.apiKey.trim();
      return cachedFirebaseApiKey;
    }
  } catch {
    // Fallback to env var if config file absent
  }
  const envKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || '';
  cachedFirebaseApiKey = envKey.trim();
  return cachedFirebaseApiKey;
}

async function verifyFirebaseIdToken(
  idToken: string
): Promise<{ uid: string; email?: string; emailVerified?: boolean } | null> {
  const apiKey = getFirebaseWebApiKey();
  if (!apiKey || !idToken) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Autenticação obrigatória. Envie Authorization: Bearer <firebaseIdToken>.',
    });
  }
  const token = authHeader.slice(7).trim();
  if (!token || token.length > 8192) {
    return res.status(401).json({ error: 'Token de autenticação inválido.' });
  }
  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' });
  }
  req.authUser = verified;
  return next();
}

const ADMIN_EMAIL = 'mat.ben.henrique@gmail.com';
function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.authUser?.emailVerified || req.authUser?.email !== ADMIN_EMAIL) {
    return res.status(403).json({
      error: 'Acesso restrito ao administrador verificado para atualização do catálogo.',
    });
  }
  return next();
}

const GEMINI_WINDOW_MS = 60 * 60 * 1000;
const GEMINI_MAX_REQUESTS_PER_HOUR = 12;
const geminiRateMap = new Map<string, number[]>();

function geminiRateLimiter(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const uid = req.authUser?.uid;
  if (!uid) {
    return res.status(401).json({ error: 'Usuário não autenticado.' });
  }
  const now = Date.now();
  const cutoff = now - GEMINI_WINDOW_MS;
  const timestamps = (geminiRateMap.get(uid) || []).filter((ts) => ts > cutoff);
  if (timestamps.length >= GEMINI_MAX_REQUESTS_PER_HOUR) {
    const oldest = timestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + GEMINI_WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Limite de 12 extrações por hora atingido. Aguarde antes de tentar novamente.',
    });
  }
  timestamps.push(now);
  geminiRateMap.set(uid, timestamps);
  return next();
}

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const ALLOWED_CATALOG_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/csv',
  'text/plain',
]);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente do servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeBase64Payload(raw: string): string {
  const idx = raw.indexOf('base64,');
  return idx >= 0 ? raw.slice(idx + 7) : raw;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '18mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'faltei-api' });
  });

  // 1. Gemini Vision: Ler Print da Grade (Autenticado + Rate limit 12/h por UID)
  app.post(
    '/api/gemini/parse-schedule',
    requireFirebaseAuth,
    geminiRateLimiter,
    async (req: AuthenticatedRequest, res) => {
    try {
      const { imageBase64, mimeType } = req.body ?? {};
      if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
        return res.status(400).json({ error: 'Envie uma imagem válida da grade de horários.' });
      }
      if (typeof mimeType !== 'string' || !ALLOWED_IMAGE_MIMES.has(mimeType)) {
        return res.status(400).json({ error: 'Formato de imagem não suportado. Use PNG, JPG ou WEBP.' });
      }

      const cleanBase64 = sanitizeBase64Payload(imageBase64.trim());
      if (cleanBase64.length > 14_000_000) {
        return res.status(400).json({ error: 'A imagem excede o limite de tamanho permitido.' });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text:
                'Analise este print do Portal do Aluno ou grade horária universitária (especialmente Medicina UNIRIO) e extraia todas as disciplinas visíveis. ' +
                'Ignore códigos numéricos soltos no nome quando possível ou mantenha o nome legível da disciplina, extraia subturmas/locais quando visíveis, ' +
                'use diaSemana de 1 (Segunda) a 6 (Sábado), horarios no formato HH:MM, periodo entre "1".."8" ou "optativa", ' +
                'calcule horas exatas de cada encontro e cargaHorariaTotal estimada.',
            },
          ],
        },
        config: {
          systemInstruction:
            'Você é um extrator preciso de grades curriculares universitárias brasileiras (UNIRIO / Portal do Aluno). Responda estritamente no schema JSON.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              disciplinas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    nome: { type: Type.STRING },
                    codigo: { type: Type.STRING },
                    local: { type: Type.STRING },
                    periodo: {
                      type: Type.STRING,
                      enum: ['1', '2', '3', '4', '5', '6', '7', '8', 'optativa'],
                    },
                    cargaHorariaTotal: { type: Type.NUMBER },
                    divisaoDiferente: { type: Type.BOOLEAN },
                    horarios: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          diaSemana: { type: Type.INTEGER },
                          horarioInicio: { type: Type.STRING },
                          horarioFim: { type: Type.STRING },
                          horas: { type: Type.NUMBER },
                          modalidadeTag: { type: Type.STRING },
                        },
                        required: ['diaSemana', 'horarioInicio', 'horarioFim', 'horas'],
                      },
                    },
                  },
                  required: ['nome', 'periodo', 'cargaHorariaTotal', 'divisaoDiferente', 'horarios'],
                },
              },
            },
            required: ['disciplinas'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{"disciplinas":[]}').trim());
      return res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao interpretar print da grade.';
      console.error('parse-schedule error:', message);
      return res.status(500).json({ error: message });
    }
  });

  // 2. Gemini Structured Outputs: Atualizador de Semestre / Catálogo (Admin verificado + Rate limit 12/h)
  app.post(
    '/api/gemini/parse-catalog',
    requireFirebaseAuth,
    requireAdmin,
    geminiRateLimiter,
    async (req: AuthenticatedRequest, res) => {
    try {
      const { fileBase64, mimeType, textContent, semestreHint } = req.body ?? {};
      const hasFile = typeof fileBase64 === 'string' && fileBase64.trim().length > 0;
      const hasText = typeof textContent === 'string' && textContent.trim().length > 0;

      if (!hasFile && !hasText) {
        return res.status(400).json({ error: 'Envie um arquivo (PDF, CSV, imagem) ou cole o texto da nova grade.' });
      }

      if (hasFile && (typeof mimeType !== 'string' || !ALLOWED_CATALOG_MIMES.has(mimeType))) {
        return res.status(400).json({ error: 'Tipo de arquivo não suportado. Use PDF, CSV, TXT ou imagem.' });
      }

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (hasFile) {
        if (mimeType === 'text/csv' || mimeType === 'text/plain') {
          const decoded = Buffer.from(sanitizeBase64Payload(fileBase64), 'base64').toString('utf8');
          parts.push({ text: `Conteúdo do arquivo (${mimeType}):\n${decoded.slice(0, 180000)}` });
        } else {
          parts.push({
            inlineData: {
              mimeType,
              data: sanitizeBase64Payload(fileBase64.trim()),
            },
          });
        }
      }
      if (hasText) {
        parts.push({ text: `Texto informado pelo administrador:\n${String(textContent).slice(0, 180000)}` });
      }

      parts.push({
        text:
          `Extraia integralmente o calendário letivo e todas as disciplinas do semestre ${
            typeof semestreHint === 'string' && semestreHint.trim() ? semestreHint.trim() : 'informado no documento'
          }. ` +
          'Para cada disciplina, gere id único slugificado (somente letras minúsculas, números e underscore), nome, local, periodo ("1".."8" ou "optativa"), ' +
          'horarios com diaSemana (1=Seg..6=Sáb), horarioInicio (HH:MM), horarioFim (HH:MM), horas, divisaoDiferente (boolean), e cargaHorariaTotal.',
      });

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction:
            'Você extrai catálogos acadêmicos completos de faculdades (ex: Medicina UNIRIO 2027.1) em JSON estruturado.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              semestre: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  nome: { type: Type.STRING },
                  dataInicio: { type: Type.STRING },
                  dataFim: { type: Type.STRING },
                  feriados: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        data: { type: Type.STRING },
                        nome: { type: Type.STRING },
                      },
                      required: ['data', 'nome'],
                    },
                  },
                },
                required: ['id', 'nome', 'dataInicio', 'dataFim', 'feriados'],
              },
              disciplinas: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    nome: { type: Type.STRING },
                    local: { type: Type.STRING },
                    periodo: {
                      type: Type.STRING,
                      enum: ['1', '2', '3', '4', '5', '6', '7', '8', 'optativa'],
                    },
                    divisaoDiferente: { type: Type.BOOLEAN },
                    cargaHorariaTotal: { type: Type.NUMBER },
                    horarios: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          diaSemana: { type: Type.INTEGER },
                          horarioInicio: { type: Type.STRING },
                          horarioFim: { type: Type.STRING },
                          horas: { type: Type.NUMBER },
                        },
                        required: ['diaSemana', 'horarioInicio', 'horarioFim', 'horas'],
                      },
                    },
                  },
                  required: ['id', 'nome', 'local', 'periodo', 'divisaoDiferente', 'cargaHorariaTotal', 'horarios'],
                },
              },
            },
            required: ['semestre', 'disciplinas'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao processar documento do semestre.';
      console.error('parse-catalog error:', message);
      return res.status(500).json({ error: message });
    }
  });

  // 3. Notificações Push ("Plantão Noturno do Cúmplice") — Rota autenticada para Cloud Scheduler / Digest
  app.post('/api/notifications/digest', requireFirebaseAuth, async (req: AuthenticatedRequest, res) => {
    const uid = req.authUser?.uid;
    const { title, body, scenario, targetDate, targetTab } = req.body ?? {};
    const safeTitle =
      typeof title === 'string' && title.trim()
        ? title.trim().slice(0, 140)
        : 'faltei. — Plantão Noturno do Cúmplice';
    const safeBody =
      typeof body === 'string' && body.trim()
        ? body.trim().slice(0, 300)
        : 'Confira suas aulas de amanhã e o saldo da sua cota no app.';

    return res.json({
      ok: true,
      uid,
      scheduledAt: new Date().toISOString(),
      digest: {
        scenario: typeof scenario === 'string' ? scenario : 'maratona',
        title: safeTitle,
        body: safeBody,
        targetDate: typeof targetDate === 'string' ? targetDate : null,
        targetTab: typeof targetTab === 'string' ? targetTab : 'hoje',
      },
    });
  });

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const parsed = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (parsed.search ? '&' + parsed.search.slice(1) : '') + (parsed.hash || '');
}
export class ErrorOverlay {}
`);
    });
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`faltei. server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
