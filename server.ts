import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // 1. Gemini Vision: Ler Print da Grade
  app.post('/api/gemini/parse-schedule', async (req, res) => {
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

  // 2. Gemini Structured Outputs: Atualizador de Semestre / Catálogo (ex: 2027.1)
  app.post('/api/gemini/parse-catalog', async (req, res) => {
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

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
