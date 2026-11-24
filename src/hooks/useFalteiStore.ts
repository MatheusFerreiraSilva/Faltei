import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { CATALOGO_2026_2, SEMESTRE_2026_2 } from '../data/seed2026_2';
import {
  ADMIN_EMAIL,
  auth,
  db,
  handleFirestoreError,
  OperationType,
  updateFirebaseDisplayName,
} from '../lib/firebase';
import {
  AvisoColetivo,
  AvisoColetivoTipo,
  CatalogoDisciplina,
  DiaSemana,
  DisciplinaComunidade,
  FaltaTipo,
  PeriodoId,
  SemAulaConsenso,
  SemestreConfig,
  UserEvento,
  UserEventoTipo,
  UserFalta,
  UserMateria,
  UserProfile,
} from '../types/domain';
import { addDaysIso, countScheduledMeetings, toIsoDateLocal } from '../utils/attendance';
import { isStale2026Catalog } from '../utils/catalogMatcher';
import {
  buildSemAulaConsensoId,
  filterAvisosForMaterias,
  resolveDisciplinaKey,
  sanitizeAuthorDisplayName,
  slugifyDisciplinaNome,
} from '../utils/disciplinaKey';

const LOCAL_STORAGE_KEY = 'faltei_preview_state_v1';

interface LocalStateSnapshot {
  materias: UserMateria[];
  faltas: UserFalta[];
  eventos?: UserEvento[];
  semestre?: SemestreConfig;
  catalogo?: CatalogoDisciplina[];
  comunidadeMap?: Record<string, DisciplinaComunidade>;
  avisosColetivos?: AvisoColetivo[];
  confirmedAvisoIds?: string[];
  semAulaConsensoMap?: Record<string, SemAulaConsenso>;
  displayName?: string;
  periodoAtual?: PeriodoId;
  percentualPadrao?: number;
  migratedToCloudUid?: string;
}

function generateDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildMateriaFromCatalogo(
  cat: CatalogoDisciplina,
  userId: string,
  semestre: SemestreConfig,
  defaultPercentual = 25
): Omit<UserMateria, 'createdAt' | 'updatedAt'> {
  const encontrosTotais = Math.max(
    1,
    countScheduledMeetings(cat.horarios, semestre.dataInicio, semestre.dataFim, semestre.feriados)
  );
  const pct = Math.max(1, Math.min(99, Math.round(defaultPercentual || 25)));
  return {
    id: generateDocId('mat'),
    userId,
    catalogoId: cat.id,
    disciplinaKey: cat.id,
    semestreId: semestre.id,
    nome: cat.nome.slice(0, 160),
    local: (cat.local || '').slice(0, 160),
    periodo: cat.periodo,
    horarios: cat.horarios.slice(0, 7),
    regraModo: cat.divisaoDiferente ? 'diferente_por_dia' : 'horas_totais',
    cargaHorariaTotal: Math.max(1, Math.min(1000, cat.cargaHorariaTotal)),
    percentualLimite: pct,
    cotaIsoladaPorDia: false,
    encontrosTotaisSemestre: encontrosTotais,
  };
}

function readLocalState(): LocalStateSnapshot | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalStateSnapshot;
  } catch {
    return null;
  }
}

function writeLocalState(state: LocalStateSnapshot) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota issues in preview
  }
}

export function useFalteiStore() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [previewMode, setPreviewMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('autostart') === '1';
    }
    return false;
  });

  const [semestreConfig, setSemestreConfig] = useState<SemestreConfig>(SEMESTRE_2026_2);
  const [catalogo, setCatalogo] = useState<CatalogoDisciplina[]>(CATALOGO_2026_2);
  const [materias, setMaterias] = useState<UserMateria[]>([]);
  const [faltas, setFaltas] = useState<UserFalta[]>([]);
  const [eventos, setEventos] = useState<UserEvento[]>([]);
  const [comunidadeMap, setComunidadeMap] = useState<Record<string, DisciplinaComunidade>>({});
  const [semAulaConsensoMap, setSemAulaConsensoMap] = useState<Record<string, SemAulaConsenso>>({});
  const [rawAvisos, setRawAvisos] = useState<AvisoColetivo[]>([]);
  const [confirmedAvisoIds, setConfirmedAvisoIds] = useState<string[]>([]);
  const [hasLocalPreviewToMigrate, setHasLocalPreviewToMigrate] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const seededOnceRef = useRef(false);
  const syncedKeysRef = useRef<Set<string>>(new Set());

  const todayStr = useMemo(() => toIsoDateLocal(new Date()), []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      setAuthReady(true);
      if (u) {
        setPreviewMode(false);
      }
    });
    return unsub;
  }, []);

  // Public shared config & catalog listeners
  useEffect(() => {
    if (!authReady) return;

    const configRef = doc(db, 'config', 'semestre_atual');
    const unsubConfig = onSnapshot(
      configRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as SemestreConfig;
          if (data?.id && data?.dataInicio && data?.dataFim) {
            setSemestreConfig(data);
          }
        }
      },
      (error) => {
        console.warn('Config listener warning:', error.message);
      }
    );

    const catCol = collection(db, 'catalogo_disciplinas');
    const unsubCat = onSnapshot(
      catCol,
      (snap) => {
        if (!snap.empty) {
          const docs = snap.docs.map((d) => d.data() as CatalogoDisciplina);
          if (!isStale2026Catalog(docs)) {
            setCatalogo(docs);
          }
        }
      },
      (error) => {
        console.warn('Catalog listener warning:', error.message);
      }
    );

    return () => {
      unsubConfig();
      unsubCat();
    };
  }, [authReady]);

  // Seed or sync Firestore /config/semestre_atual and /catalogo_disciplinas when Exclusive Admin signs in
  const seedSharedCatalogIfNeeded = useCallback(async (user: User, isUserAdmin: boolean) => {
    if (!isUserAdmin || seededOnceRef.current) return;
    seededOnceRef.current = true;
    try {
      const configRef = doc(db, 'config', 'semestre_atual');
      const existing = await getDoc(configRef);
      const catSnap = await getDocs(collection(db, 'catalogo_disciplinas'));
      const existingDocs = catSnap.docs.map((d) => d.data() as CatalogoDisciplina);
      const targetIds = new Set(CATALOGO_2026_2.map((c) => c.id));

      const needsInitialSeed = !existing.exists() || catSnap.empty;
      const isStale2026Seed =
        existing.exists() &&
        existing.data()?.id === '2026.2' &&
        (existingDocs.length !== targetIds.size || isStale2026Catalog(existingDocs));

      if (needsInitialSeed || isStale2026Seed) {
        await setDoc(configRef, {
          id: SEMESTRE_2026_2.id,
          nome: SEMESTRE_2026_2.nome,
          dataInicio: SEMESTRE_2026_2.dataInicio,
          dataFim: SEMESTRE_2026_2.dataFim,
          feriados: SEMESTRE_2026_2.feriados,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });

        const obsoleteDocs = catSnap.docs.filter((d) => !targetIds.has(d.id));
        for (let i = 0; i < obsoleteDocs.length; i += 400) {
          const batch = writeBatch(db);
          for (const oldDoc of obsoleteDocs.slice(i, i + 400)) {
            batch.delete(oldDoc.ref);
          }
          await batch.commit();
        }

        for (let i = 0; i < CATALOGO_2026_2.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = CATALOGO_2026_2.slice(i, i + 400);
          for (const item of chunk) {
            batch.set(doc(db, 'catalogo_disciplinas', item.id), {
              ...item,
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        }
      }
    } catch (err) {
      console.warn('Auto-seed catalog skipped:', err);
    }
  }, []);

  // User profile & private collections when authenticated
  useEffect(() => {
    if (!authReady) return;

    if (!firebaseUser) {
      setHasLocalPreviewToMigrate(false);
      if (previewMode) {
        const stored = readLocalState();
        if (stored && stored.materias.length > 0) {
          setUserProfile({
            uid: 'local_preview',
            email: 'Preview local (sem e-mail)',
            displayName: stored.displayName || 'Estudante',
            role: 'student',
            periodoAtual: stored.periodoAtual || '4',
            percentualPadrao: stored.percentualPadrao || 25,
          });
          setMaterias(stored.materias);
          setFaltas(stored.faltas || []);
          setEventos(stored.eventos || []);
          if (stored.semestre) setSemestreConfig(stored.semestre);
          if (stored.catalogo?.length && !isStale2026Catalog(stored.catalogo)) {
            setCatalogo(stored.catalogo);
          }
          if (stored.comunidadeMap) {
            setComunidadeMap(stored.comunidadeMap);
          } else {
            const builtMap: Record<string, DisciplinaComunidade> = {};
            for (const m of stored.materias) {
              const key = resolveDisciplinaKey(m);
              if (!builtMap[key]) {
                builtMap[key] = {
                  key,
                  semestreId: m.semestreId,
                  nome: m.nome,
                  ...(m.catalogoId ? { catalogoId: m.catalogoId } : {}),
                  inscritosCount: 1,
                };
              }
            }
            setComunidadeMap(builtMap);
          }
          setSemAulaConsensoMap(stored.semAulaConsensoMap || {});
          setRawAvisos(stored.avisosColetivos || []);
          setConfirmedAvisoIds(stored.confirmedAvisoIds || []);
        } else {
          // Autostart / preview seed with 4º Período so user immediately sees rich cockpit
          const params =
            typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
          if (params?.get('autostart') === '1') {
            const p4 = CATALOGO_2026_2.filter((d) => d.periodo === '4').map((cat) => ({
              ...buildMateriaFromCatalogo(cat, 'local_preview', SEMESTRE_2026_2),
            }));
            const farmaco = p4.find((m) => m.nome.includes('Farmacologia'));
            const psico = p4.find((m) => m.nome.includes('Psicologia'));
            const sampleFaltas: UserFalta[] = [];
            if (farmaco) {
              sampleFaltas.push(
                {
                  id: 'prev_f1',
                  userId: 'local_preview',
                  materiaId: farmaco.id,
                  data: '2026-09-08',
                  diaSemana: 2,
                  horas: 4,
                  tipo: 'falta',
                },
                {
                  id: 'prev_f2',
                  userId: 'local_preview',
                  materiaId: farmaco.id,
                  data: '2026-09-22',
                  diaSemana: 2,
                  horas: 4,
                  tipo: 'falta',
                },
                {
                  id: 'prev_f3',
                  userId: 'local_preview',
                  materiaId: farmaco.id,
                  data: '2026-10-06',
                  diaSemana: 2,
                  horas: 4,
                  tipo: 'falta',
                }
              );
            }
            if (psico) {
              sampleFaltas.push({
                id: 'prev_f4',
                userId: 'local_preview',
                materiaId: psico.id,
                data: '2026-09-21',
                diaSemana: 1,
                horas: 4,
                tipo: 'falta',
              });
            }
            const previewComunidade: Record<string, DisciplinaComunidade> = {};
            for (const m of p4) {
              const key = resolveDisciplinaKey(m);
              previewComunidade[key] = {
                key,
                semestreId: SEMESTRE_2026_2.id,
                nome: m.nome,
                ...(m.catalogoId ? { catalogoId: m.catalogoId } : {}),
                inscritosCount: m.nome.includes('Psicologia') ? 14 : 9,
              };
            }
            const todayDow = new Date(`${todayStr}T12:00:00Z`).getUTCDay();
            const todayScheduledMat =
              p4.find((m) => m.horarios.some((h) => h.diaSemana === todayDow)) || psico;

            const previewAvisos: AvisoColetivo[] = todayScheduledMat
              ? [
                  {
                    id: 'prev_av1',
                    disciplinaKey: resolveDisciplinaKey(todayScheduledMat),
                    disciplinaNome: todayScheduledMat.nome,
                    semestreId: SEMESTRE_2026_2.id,
                    data: todayStr,
                    tipo: 'mudanca_sala',
                    mensagem: 'Aula transferida para o Anfiteatro Geral (4º andar HUGG).',
                    autorUid: 'preview_peer',
                    autorNome: 'Representante 4ºP',
                    isOficial: false,
                    confirmacoes: 5,
                  },
                ]
              : [];

            const semiologia = p4.find((m) => m.nome.includes('Semiologia'));
            const anatoPat = p4.find((m) => m.nome.includes('Anatomia Patológica'));
            const previewEventos: UserEvento[] = [];
            if (farmaco) {
              previewEventos.push({
                id: 'prev_ev1',
                userId: 'local_preview',
                materiaId: farmaco.id,
                disciplinaKey: resolveDisciplinaKey(farmaco),
                disciplinaNome: farmaco.nome,
                semestreId: SEMESTRE_2026_2.id,
                data: addDaysIso(todayStr, 1),
                tipo: 'prova',
                titulo: 'P2 — Farmacologia Autonômica e Cardiovascular',
                detalhes: 'Anfiteatro da Farmacologia · Conteúdo das aulas 08 a 14',
                horario: '08:00',
              });
            }
            if (semiologia) {
              previewEventos.push({
                id: 'prev_ev2',
                userId: 'local_preview',
                materiaId: semiologia.id,
                disciplinaKey: resolveDisciplinaKey(semiologia),
                disciplinaNome: semiologia.nome,
                semestreId: SEMESTRE_2026_2.id,
                data: addDaysIso(todayStr, 2),
                tipo: 'trabalho_grupo',
                titulo: 'Discussão de caso clínico no HUGG',
                grupo: 'Grupo 2 (Ana, Lucas, Mateus)',
                horario: '13:30',
              });
            }
            if (anatoPat) {
              previewEventos.push({
                id: 'prev_ev3',
                userId: 'local_preview',
                materiaId: anatoPat.id,
                disciplinaKey: resolveDisciplinaKey(anatoPat),
                disciplinaNome: anatoPat.nome,
                semestreId: SEMESTRE_2026_2.id,
                data: addDaysIso(todayStr, 4),
                tipo: 'seminario',
                titulo: 'Seminário de Neoplasias e Inflamação Crônica',
                detalhes: 'Apresentação oral de 15 min por equipe',
                horario: '10:00',
              });
            }

            const previewSemAulaConsenso: Record<string, SemAulaConsenso> = {};
            if (todayScheduledMat) {
              const targetKey = resolveDisciplinaKey(todayScheduledMat);
              const cId = buildSemAulaConsensoId(SEMESTRE_2026_2.id, targetKey, todayStr);
              previewSemAulaConsenso[cId] = {
                id: cId,
                disciplinaKey: targetKey,
                disciplinaNome: todayScheduledMat.nome,
                semestreId: SEMESTRE_2026_2.id,
                data: todayStr,
                votosCount: 5,
                ultimoAutorNome: 'Ana Clara',
                votedByMe: false,
              };
            }

            const defaultPreviewProfile: UserProfile = {
              uid: 'local_preview',
              email: 'Preview local (sem e-mail)',
              displayName: stored?.displayName || 'Estudante',
              role: 'student',
              periodoAtual: stored?.periodoAtual || '4',
              percentualPadrao: stored?.percentualPadrao || 25,
            };
            setUserProfile(defaultPreviewProfile);
            setMaterias(p4);
            setFaltas(sampleFaltas);
            setEventos(previewEventos);
            setComunidadeMap(previewComunidade);
            setSemAulaConsensoMap(previewSemAulaConsenso);
            setRawAvisos(previewAvisos);
            setConfirmedAvisoIds([]);
            writeLocalState({
              materias: p4,
              faltas: sampleFaltas,
              eventos: previewEventos,
              comunidadeMap: previewComunidade,
              semAulaConsensoMap: previewSemAulaConsenso,
              avisosColetivos: previewAvisos,
              confirmedAvisoIds: [],
              displayName: defaultPreviewProfile.displayName,
              periodoAtual: defaultPreviewProfile.periodoAtual,
              percentualPadrao: defaultPreviewProfile.percentualPadrao,
            });
          } else {
            setUserProfile({
              uid: 'local_preview',
              email: 'Preview local (sem e-mail)',
              displayName: stored?.displayName || 'Estudante',
              role: 'student',
              periodoAtual: stored?.periodoAtual,
              percentualPadrao: stored?.percentualPadrao || 25,
            });
            setMaterias([]);
            setFaltas([]);
            setEventos([]);
            setComunidadeMap({});
            setSemAulaConsensoMap({});
            setRawAvisos([]);
            setConfirmedAvisoIds([]);
          }
        }
      } else {
        setUserProfile(null);
        setMaterias([]);
        setFaltas([]);
        setEventos([]);
        setComunidadeMap({});
        setSemAulaConsensoMap({});
        setRawAvisos([]);
        setConfirmedAvisoIds([]);
      }
      setLoadingData(false);
      return;
    }

    let cancelled = false;
    setLoadingData(true);

    // Check if there are unsynced local preview items eligible for optional cloud migration
    const localSnapshot = readLocalState();
    const hasCustomLocal = Boolean(
      localSnapshot &&
        localSnapshot.migratedToCloudUid !== firebaseUser.uid &&
        (localSnapshot.materias?.length > 0 ||
          (localSnapshot.faltas?.length || 0) > 0 ||
          (localSnapshot.eventos?.length || 0) > 0)
    );
    setHasLocalPreviewToMigrate(hasCustomLocal);

    const userRef = doc(db, 'users', firebaseUser.uid);
    const isExclusiveAdmin = Boolean(
      firebaseUser.emailVerified && firebaseUser.email === ADMIN_EMAIL
    );
    const effectiveRole: 'admin' | 'student' = isExclusiveAdmin ? 'admin' : 'student';

    const ensureProfile = async () => {
      try {
        const snap = await getDoc(userRef);
        const fallbackName = sanitizeAuthorDisplayName(
          firebaseUser.displayName,
          firebaseUser.email
        );

        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            email: (firebaseUser.email || '').slice(0, 200),
            displayName: fallbackName.slice(0, 120),
            role: effectiveRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const existingData = snap.data() as UserProfile;
          const nextEmail = (firebaseUser.email || existingData.email || '').slice(0, 200);
          if (nextEmail && existingData.email !== nextEmail) {
            await updateDoc(userRef, {
              email: nextEmail,
              updatedAt: serverTimestamp(),
            });
          }
        }
        await seedSharedCatalogIfNeeded(firebaseUser, isExclusiveAdmin);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
      }
    };
    void ensureProfile();

    // Real-time profile sync across tabs and devices
    const unsubProfile = onSnapshot(
      userRef,
      (snap) => {
        if (cancelled || !snap.exists()) return;
        const profile = snap.data() as UserProfile;
        setUserProfile({
          ...profile,
          email: firebaseUser.email || profile.email || '',
          displayName: sanitizeAuthorDisplayName(
            profile.displayName || firebaseUser.displayName,
            firebaseUser.email || profile.email
          ),
          role: effectiveRole,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
      }
    );

    const materiasPath = `users/${firebaseUser.uid}/materias`;
    const qMaterias = query(
      collection(db, materiasPath),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubMaterias = onSnapshot(
      qMaterias,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserMateria);
        setMaterias(list);
        setLoadingData(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, materiasPath);
      }
    );

    const faltasPath = `users/${firebaseUser.uid}/faltas`;
    const qFaltas = query(
      collection(db, faltasPath),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubFaltas = onSnapshot(
      qFaltas,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserFalta);
        setFaltas(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, faltasPath);
      }
    );

    const eventosPath = `users/${firebaseUser.uid}/eventos`;
    const qEventos = query(
      collection(db, eventosPath),
      where('userId', '==', firebaseUser.uid)
    );
    const unsubEventos = onSnapshot(
      qEventos,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserEvento);
        setEventos(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, eventosPath);
      }
    );

    return () => {
      cancelled = true;
      unsubProfile();
      unsubMaterias();
      unsubFaltas();
      unsubEventos();
    };
  }, [authReady, firebaseUser, previewMode, seedSharedCatalogIfNeeded, todayStr]);

  // Sync enrollments & listen to collective discipline counts + announcements when authenticated
  const enrolledKeys = useMemo(() => {
    const map = new Map<string, { key: string; nome: string; semestreId: string; catalogoId?: string }>();
    for (const m of materias) {
      const key = resolveDisciplinaKey(m);
      if (!map.has(key)) {
        map.set(key, {
          key,
          nome: m.nome,
          semestreId: m.semestreId || semestreConfig.id,
          catalogoId: m.catalogoId,
        });
      }
    }
    return Array.from(map.values());
  }, [materias, semestreConfig.id]);

  const ensureCommunityEnrollment = useCallback(
    async (
      uid: string,
      key: string,
      nome: string,
      semestreId: string,
      catalogoId?: string
    ) => {
      const comRef = doc(db, 'disciplinas_comunidade', key);
      const insRef = doc(db, 'disciplinas_comunidade', key, 'inscritos', uid);
      try {
        await runTransaction(db, async (tx) => {
          const [comSnap, insSnap] = await Promise.all([tx.get(comRef), tx.get(insRef)]);
          if (insSnap.exists()) return;

          tx.set(insRef, {
            userId: uid,
            disciplinaKey: key,
            semestreId: semestreId.slice(0, 32),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (!comSnap.exists()) {
            tx.set(comRef, {
              key,
              semestreId: semestreId.slice(0, 32),
              nome: nome.trim().slice(0, 160),
              ...(catalogoId ? { catalogoId: catalogoId.slice(0, 128) } : {}),
              inscritosCount: 1,
              updatedAt: serverTimestamp(),
            });
          } else {
            const current = Number(comSnap.data()?.inscritosCount) || 0;
            tx.update(comRef, {
              inscritosCount: current + 1,
              updatedAt: serverTimestamp(),
            });
          }
        });
      } catch (error) {
        console.warn('Community enroll sync warning:', error);
      }
    },
    []
  );

  const leaveCommunityEnrollment = useCallback(
    async (uid: string, key: string, remainingMaterias: UserMateria[]) => {
      if (remainingMaterias.some((m) => resolveDisciplinaKey(m) === key)) {
        return;
      }
      syncedKeysRef.current.delete(`${uid}:${key}`);
      const comRef = doc(db, 'disciplinas_comunidade', key);
      const insRef = doc(db, 'disciplinas_comunidade', key, 'inscritos', uid);
      try {
        await runTransaction(db, async (tx) => {
          const [comSnap, insSnap] = await Promise.all([tx.get(comRef), tx.get(insRef)]);
          if (!insSnap.exists()) return;
          tx.delete(insRef);
          if (comSnap.exists()) {
            const current = Number(comSnap.data()?.inscritosCount) || 1;
            tx.update(comRef, {
              inscritosCount: Math.max(0, current - 1),
              updatedAt: serverTimestamp(),
            });
          }
        });
      } catch (error) {
        console.warn('Community leave sync warning:', error);
      }
    },
    []
  );

  useEffect(() => {
    if (!authReady || !firebaseUser || enrolledKeys.length === 0) return;

    // Ensure every enrolled discipline (including manual slugified ones) is synced once per session
    for (const item of enrolledKeys) {
      const marker = `${firebaseUser.uid}:${item.key}`;
      if (!syncedKeysRef.current.has(marker)) {
        syncedKeysRef.current.add(marker);
        void ensureCommunityEnrollment(
          firebaseUser.uid,
          item.key,
          item.nome,
          item.semestreId,
          item.catalogoId
        );
      }
    }

    // Listen to each disciplinaKey community doc (single-doc get listener; no list scraping)
    const unsubs: Array<() => void> = [];
    for (const item of enrolledKeys) {
      const path = `disciplinas_comunidade/${item.key}`;
      const unsub = onSnapshot(
        doc(db, 'disciplinas_comunidade', item.key),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as DisciplinaComunidade;
            setComunidadeMap((prev) => ({ ...prev, [item.key]: data }));
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, path);
        }
      );
      unsubs.push(unsub);
    }

    // Listen to collective announcements & sem_aula consensus for enrolled disciplinaKeys
    const keysList = enrolledKeys.map((k) => k.key);
    const chunkResults = new Map<number, AvisoColetivo[]>();
    const consensoChunkResults = new Map<number, Record<string, SemAulaConsenso>>();
    for (let i = 0; i < keysList.length; i += 30) {
      const chunkIdx = i;
      const chunk = keysList.slice(i, i + 30);
      const qAvisos = query(
        collection(db, 'avisos_coletivos'),
        where('semestreId', '==', semestreConfig.id),
        where('disciplinaKey', 'in', chunk)
      );
      const unsubAviso = onSnapshot(
        qAvisos,
        (snap) => {
          chunkResults.set(
            chunkIdx,
            snap.docs.map((d) => d.data() as AvisoColetivo)
          );
          const merged: AvisoColetivo[] = [];
          chunkResults.forEach((arr) => merged.push(...arr));
          setRawAvisos(merged);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'avisos_coletivos');
        }
      );
      unsubs.push(unsubAviso);

      const qConsenso = query(
        collection(db, 'sem_aula_consenso'),
        where('semestreId', '==', semestreConfig.id),
        where('disciplinaKey', 'in', chunk)
      );
      const unsubConsenso = onSnapshot(
        qConsenso,
        (snap) => {
          const mapChunk: Record<string, SemAulaConsenso> = {};
          for (const d of snap.docs) {
            const c = d.data() as SemAulaConsenso;
            mapChunk[c.id] = c;
          }
          consensoChunkResults.set(chunkIdx, mapChunk);
          const mergedConsenso: Record<string, SemAulaConsenso> = {};
          consensoChunkResults.forEach((m) => Object.assign(mergedConsenso, m));
          setSemAulaConsensoMap(mergedConsenso);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'sem_aula_consenso');
        }
      );
      unsubs.push(unsubConsenso);
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, enrolledKeys, ensureCommunityEnrollment, firebaseUser, semestreConfig.id]);

  // Persist local preview state whenever mutated in previewMode
  const syncLocal = useCallback(
    (
      nextMaterias: UserMateria[],
      nextFaltas: UserFalta[],
      nextSem?: SemestreConfig,
      nextCat?: CatalogoDisciplina[],
      nextComunidade?: Record<string, DisciplinaComunidade>,
      nextAvisos?: AvisoColetivo[],
      nextConfirmedIds?: string[],
      nextEventos?: UserEvento[],
      nextConsensoMap?: Record<string, SemAulaConsenso>,
      nextProfilePatch?: Partial<Pick<UserProfile, 'displayName' | 'periodoAtual' | 'percentualPadrao'>>
    ) => {
      const existingStored = readLocalState();
      writeLocalState({
        materias: nextMaterias,
        faltas: nextFaltas,
        eventos: nextEventos || eventos,
        semestre: nextSem || semestreConfig,
        catalogo: nextCat || catalogo,
        comunidadeMap: nextComunidade || comunidadeMap,
        avisosColetivos: nextAvisos || rawAvisos,
        confirmedAvisoIds: nextConfirmedIds || confirmedAvisoIds,
        semAulaConsensoMap: nextConsensoMap || semAulaConsensoMap,
        displayName: nextProfilePatch?.displayName ?? userProfile?.displayName ?? existingStored?.displayName,
        periodoAtual: nextProfilePatch?.periodoAtual ?? userProfile?.periodoAtual ?? existingStored?.periodoAtual,
        percentualPadrao:
          nextProfilePatch?.percentualPadrao ??
          userProfile?.percentualPadrao ??
          existingStored?.percentualPadrao,
        migratedToCloudUid: existingStored?.migratedToCloudUid,
      });
    },
    [
      catalogo,
      comunidadeMap,
      confirmedAvisoIds,
      eventos,
      rawAvisos,
      semAulaConsensoMap,
      semestreConfig,
      userProfile?.displayName,
      userProfile?.percentualPadrao,
      userProfile?.periodoAtual,
    ]
  );

  const enterPreviewMode = useCallback(() => {
    setPreviewMode(true);
    const stored = readLocalState();
    if (stored) {
      setMaterias(stored.materias || []);
      setFaltas(stored.faltas || []);
      setEventos(stored.eventos || []);
      if (stored.comunidadeMap) setComunidadeMap(stored.comunidadeMap);
      if (stored.semAulaConsensoMap) setSemAulaConsensoMap(stored.semAulaConsensoMap);
      if (stored.avisosColetivos) setRawAvisos(stored.avisosColetivos);
      if (stored.confirmedAvisoIds) setConfirmedAvisoIds(stored.confirmedAvisoIds);
    }
  }, []);

  const exitPreviewMode = useCallback(() => {
    setPreviewMode(false);
  }, []);

  // --- Mutations ---
  const importPeriodo = useCallback(
    async (periodo: PeriodoId) => {
      const uid = firebaseUser?.uid || 'local_preview';
      const toImport = catalogo.filter(
        (c) => c.periodo === periodo && !materias.some((m) => m.catalogoId === c.id || m.nome === c.nome)
      );
      if (toImport.length === 0) return 0;

      const defaultPct = userProfile?.percentualPadrao ?? 25;
      const built = toImport.map((c) => buildMateriaFromCatalogo(c, uid, semestreConfig, defaultPct));

      if (!firebaseUser) {
        const next = [...materias, ...built];
        const nextCom = { ...comunidadeMap };
        for (const b of built) {
          const k = resolveDisciplinaKey(b);
          if (!materias.some((m) => resolveDisciplinaKey(m) === k)) {
            const cur = nextCom[k];
            nextCom[k] = {
              key: k,
              semestreId: semestreConfig.id,
              nome: b.nome,
              ...(b.catalogoId ? { catalogoId: b.catalogoId } : {}),
              inscritosCount: (cur?.inscritosCount || 0) + 1,
            };
          }
        }
        setMaterias(next);
        setComunidadeMap(nextCom);
        syncLocal(next, faltas, undefined, undefined, nextCom);
        return built.length;
      }

      const pathPrefix = `users/${firebaseUser.uid}/materias`;
      try {
        const batch = writeBatch(db);
        for (const item of built) {
          batch.set(doc(db, pathPrefix, item.id), {
            ...item,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        for (const item of built) {
          const k = resolveDisciplinaKey(item);
          syncedKeysRef.current.add(`${firebaseUser.uid}:${k}`);
          void ensureCommunityEnrollment(
            firebaseUser.uid,
            k,
            item.nome,
            semestreConfig.id,
            item.catalogoId
          );
        }
        return built.length;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, pathPrefix);
      }
    },
    [catalogo, comunidadeMap, ensureCommunityEnrollment, faltas, firebaseUser, materias, semestreConfig, syncLocal, userProfile?.percentualPadrao]
  );

  const addMateria = useCallback(
    async (
      input: Omit<UserMateria, 'id' | 'userId' | 'semestreId' | 'createdAt' | 'updatedAt'>
    ) => {
      const uid = firebaseUser?.uid || 'local_preview';
      const id = generateDocId('mat');
      const encontros =
        input.encontrosTotaisSemestre ||
        Math.max(
          1,
          countScheduledMeetings(
            input.horarios,
            semestreConfig.dataInicio,
            semestreConfig.dataFim,
            semestreConfig.feriados
          )
        );
      const disciplinaKey = resolveDisciplinaKey({
        catalogoId: input.catalogoId,
        disciplinaKey: input.disciplinaKey,
        nome: input.nome,
      });
      const payload: UserMateria = {
        id,
        userId: uid,
        ...(input.catalogoId ? { catalogoId: input.catalogoId.slice(0, 128) } : {}),
        disciplinaKey,
        semestreId: semestreConfig.id,
        nome: input.nome.trim().slice(0, 160),
        local: (input.local || '').trim().slice(0, 160),
        periodo: input.periodo,
        horarios: input.horarios.slice(0, 7),
        regraModo: input.regraModo,
        cargaHorariaTotal: Math.max(1, Math.min(1000, Number(input.cargaHorariaTotal) || 32)),
        percentualLimite: Math.max(1, Math.min(99, Number(input.percentualLimite) || 25)),
        cotaIsoladaPorDia: Boolean(input.cotaIsoladaPorDia),
        encontrosTotaisSemestre: Math.max(1, Math.min(400, encontros)),
      };

      if (!firebaseUser) {
        const next = [...materias, payload];
        const nextCom = { ...comunidadeMap };
        if (!materias.some((m) => resolveDisciplinaKey(m) === disciplinaKey)) {
          const cur = nextCom[disciplinaKey];
          nextCom[disciplinaKey] = {
            key: disciplinaKey,
            semestreId: semestreConfig.id,
            nome: payload.nome,
            ...(payload.catalogoId ? { catalogoId: payload.catalogoId } : {}),
            inscritosCount: (cur?.inscritosCount || 0) + 1,
          };
        }
        setMaterias(next);
        setComunidadeMap(nextCom);
        syncLocal(next, faltas, undefined, undefined, nextCom);
        return payload;
      }

      const path = `users/${firebaseUser.uid}/materias/${id}`;
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid, 'materias', id), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        syncedKeysRef.current.add(`${firebaseUser.uid}:${disciplinaKey}`);
        await ensureCommunityEnrollment(
          firebaseUser.uid,
          disciplinaKey,
          payload.nome,
          semestreConfig.id,
          payload.catalogoId
        );
        return payload;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [comunidadeMap, ensureCommunityEnrollment, faltas, firebaseUser, materias, semestreConfig, syncLocal]
  );

  const updateMateria = useCallback(
    async (materiaId: string, updates: Partial<UserMateria>) => {
      const existingMat = materias.find((m) => m.id === materiaId);
      const oldKey = existingMat ? resolveDisciplinaKey(existingMat) : null;
      const nextNome = updates.nome !== undefined ? updates.nome.trim().slice(0, 160) : existingMat?.nome || '';
      const computedNewKey =
        existingMat && !existingMat.catalogoId && updates.nome !== undefined
          ? slugifyDisciplinaNome(nextNome)
          : updates.disciplinaKey || oldKey || undefined;

      if (!firebaseUser) {
        const next = materias.map((m) =>
          m.id === materiaId
            ? { ...m, ...updates, ...(computedNewKey ? { disciplinaKey: computedNewKey } : {}) }
            : m
        );
        const nextCom = { ...comunidadeMap };
        if (oldKey && computedNewKey && oldKey !== computedNewKey) {
          if (!next.some((m) => resolveDisciplinaKey(m) === oldKey) && nextCom[oldKey]) {
            nextCom[oldKey] = {
              ...nextCom[oldKey],
              inscritosCount: Math.max(0, nextCom[oldKey].inscritosCount - 1),
            };
          }
          if (!materias.some((m) => resolveDisciplinaKey(m) === computedNewKey)) {
            const cur = nextCom[computedNewKey];
            nextCom[computedNewKey] = {
              key: computedNewKey,
              semestreId: semestreConfig.id,
              nome: nextNome,
              inscritosCount: (cur?.inscritosCount || 0) + 1,
            };
          }
        }
        setMaterias(next);
        setComunidadeMap(nextCom);
        syncLocal(next, faltas, undefined, undefined, nextCom);
        return;
      }

      const path = `users/${firebaseUser.uid}/materias/${materiaId}`;
      try {
        const sanitized: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (updates.nome !== undefined) sanitized.nome = nextNome;
        if (computedNewKey) sanitized.disciplinaKey = computedNewKey;
        if (updates.local !== undefined) sanitized.local = updates.local.trim().slice(0, 160);
        if (updates.periodo !== undefined) sanitized.periodo = updates.periodo;
        if (updates.horarios !== undefined) sanitized.horarios = updates.horarios.slice(0, 7);
        if (updates.regraModo !== undefined) sanitized.regraModo = updates.regraModo;
        if (updates.cargaHorariaTotal !== undefined)
          sanitized.cargaHorariaTotal = Math.max(1, Math.min(1000, Number(updates.cargaHorariaTotal)));
        if (updates.percentualLimite !== undefined)
          sanitized.percentualLimite = Math.max(1, Math.min(99, Number(updates.percentualLimite)));
        if (updates.cotaIsoladaPorDia !== undefined)
          sanitized.cotaIsoladaPorDia = Boolean(updates.cotaIsoladaPorDia);
        if (updates.encontrosTotaisSemestre !== undefined)
          sanitized.encontrosTotaisSemestre = Math.max(
            1,
            Math.min(400, Number(updates.encontrosTotaisSemestre))
          );

        await updateDoc(doc(db, 'users', firebaseUser.uid, 'materias', materiaId), sanitized);
        if (oldKey && computedNewKey && oldKey !== computedNewKey) {
          const remaining = materias.map((m) =>
            m.id === materiaId ? { ...m, nome: nextNome, disciplinaKey: computedNewKey } : m
          );
          await leaveCommunityEnrollment(firebaseUser.uid, oldKey, remaining);
          await ensureCommunityEnrollment(
            firebaseUser.uid,
            computedNewKey,
            nextNome,
            semestreConfig.id,
            existingMat?.catalogoId
          );
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [comunidadeMap, ensureCommunityEnrollment, faltas, firebaseUser, leaveCommunityEnrollment, materias, semestreConfig.id, syncLocal]
  );

  const deleteMateria = useCallback(
    async (materiaId: string) => {
      const targetMat = materias.find((m) => m.id === materiaId);
      const targetKey = targetMat ? resolveDisciplinaKey(targetMat) : null;
      const remainingMats = materias.filter((m) => m.id !== materiaId);

      if (!firebaseUser) {
        const nextFaltas = faltas.filter((f) => f.materiaId !== materiaId);
        const nextEventos = eventos.filter((e) => e.materiaId !== materiaId);
        const nextCom = { ...comunidadeMap };
        if (
          targetKey &&
          !remainingMats.some((m) => resolveDisciplinaKey(m) === targetKey) &&
          nextCom[targetKey]
        ) {
          nextCom[targetKey] = {
            ...nextCom[targetKey],
            inscritosCount: Math.max(0, nextCom[targetKey].inscritosCount - 1),
          };
        }
        setMaterias(remainingMats);
        setFaltas(nextFaltas);
        setEventos(nextEventos);
        setComunidadeMap(nextCom);
        syncLocal(remainingMats, nextFaltas, undefined, undefined, nextCom, undefined, undefined, nextEventos);
        return;
      }

      const path = `users/${firebaseUser.uid}/materias/${materiaId}`;
      try {
        const related = faltas.filter((f) => f.materiaId === materiaId);
        const relatedEventos = eventos.filter((e) => e.materiaId === materiaId);
        const batch = writeBatch(db);
        for (const f of related) {
          batch.delete(doc(db, 'users', firebaseUser.uid, 'faltas', f.id));
        }
        for (const ev of relatedEventos) {
          batch.delete(doc(db, 'users', firebaseUser.uid, 'eventos', ev.id));
        }
        batch.delete(doc(db, 'users', firebaseUser.uid, 'materias', materiaId));
        await batch.commit();
        if (targetKey) {
          await leaveCommunityEnrollment(firebaseUser.uid, targetKey, remainingMats);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [comunidadeMap, eventos, faltas, firebaseUser, leaveCommunityEnrollment, materias, syncLocal]
  );

  // Helper: sync user's "sem_aula" vote into collective consensus doc
  const syncSemAulaConsensusVote = useCallback(
    async (
      materia: UserMateria | undefined,
      data: string,
      active: boolean
    ) => {
      if (!materia) return;
      const disciplinaKey = resolveDisciplinaKey(materia);
      const consensoId = buildSemAulaConsensoId(
        materia.semestreId || semestreConfig.id,
        disciplinaKey,
        data
      );
      const autorNome = sanitizeAuthorDisplayName(
        userProfile?.displayName,
        firebaseUser?.email
      );

      if (!firebaseUser) {
        setSemAulaConsensoMap((prev) => {
          const cur = prev[consensoId];
          const nextMap = { ...prev };
          if (active) {
            if (cur?.votedByMe) return prev;
            nextMap[consensoId] = {
              id: consensoId,
              disciplinaKey,
              disciplinaNome: materia.nome.slice(0, 160),
              semestreId: (materia.semestreId || semestreConfig.id).slice(0, 32),
              data,
              votosCount: (cur?.votosCount || 0) + 1,
              ultimoAutorNome: autorNome,
              votedByMe: true,
            };
          } else {
            if (!cur || !cur.votedByMe) return prev;
            nextMap[consensoId] = {
              ...cur,
              votosCount: Math.max(0, cur.votosCount - 1),
              votedByMe: false,
            };
          }
          const stored = readLocalState();
          if (stored) {
            writeLocalState({ ...stored, semAulaConsensoMap: nextMap });
          }
          return nextMap;
        });
        return;
      }

      const consensoRef = doc(db, 'sem_aula_consenso', consensoId);
      const votoRef = doc(db, 'sem_aula_consenso', consensoId, 'votos', firebaseUser.uid);
      try {
        await runTransaction(db, async (tx) => {
          const [conSnap, votoSnap] = await Promise.all([tx.get(consensoRef), tx.get(votoRef)]);
          if (active) {
            if (votoSnap.exists()) return;
            tx.set(votoRef, {
              userId: firebaseUser.uid,
              consensoId,
              disciplinaKey,
              data,
              autorNome,
              createdAt: serverTimestamp(),
            });
            if (!conSnap.exists()) {
              tx.set(consensoRef, {
                id: consensoId,
                disciplinaKey,
                disciplinaNome: materia.nome.slice(0, 160),
                semestreId: (materia.semestreId || semestreConfig.id).slice(0, 32),
                data,
                votosCount: 1,
                ultimoAutorNome: autorNome,
                updatedAt: serverTimestamp(),
              });
            } else {
              const curCount = Number(conSnap.data()?.votosCount) || 0;
              tx.update(consensoRef, {
                votosCount: curCount + 1,
                ultimoAutorNome: autorNome,
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            if (!votoSnap.exists() || !conSnap.exists()) return;
            tx.delete(votoRef);
            const curCount = Number(conSnap.data()?.votosCount) || 1;
            tx.update(consensoRef, {
              votosCount: Math.max(0, curCount - 1),
              ultimoAutorNome: String(conSnap.data()?.ultimoAutorNome || ''),
              updatedAt: serverTimestamp(),
            });
          }
        });
      } catch (error) {
        console.warn('Sem aula consensus sync warning:', error);
      }
    },
    [faltas, firebaseUser, materias, semestreConfig.id, syncLocal, userProfile?.displayName]
  );

  const recordFalta = useCallback(
    async (params: {
      materiaId: string;
      data: string;
      diaSemana: DiaSemana;
      horas: number;
      tipo: FaltaTipo;
      observacao?: string;
    }) => {
      const uid = firebaseUser?.uid || 'local_preview';
      const targetMateria = materias.find((m) => m.id === params.materiaId);
      const existingSameDay = faltas.find(
        (f) => f.materiaId === params.materiaId && f.data === params.data
      );

      if (existingSameDay) {
        const wasSemAula = existingSameDay.tipo === 'sem_aula';
        const willBeSemAula = params.tipo === 'sem_aula';
        // Update existing record on that date
        if (!firebaseUser) {
          const next = faltas.map((f) =>
            f.id === existingSameDay.id
              ? {
                  ...f,
                  tipo: params.tipo,
                  horas: params.horas,
                  ...(params.observacao ? { observacao: params.observacao.slice(0, 240) } : {}),
                }
              : f
          );
          setFaltas(next);
          syncLocal(materias, next);
          if (wasSemAula !== willBeSemAula) {
            void syncSemAulaConsensusVote(targetMateria, params.data, willBeSemAula);
          }
          return;
        }
        const path = `users/${firebaseUser.uid}/faltas/${existingSameDay.id}`;
        try {
          await updateDoc(doc(db, 'users', firebaseUser.uid, 'faltas', existingSameDay.id), {
            tipo: params.tipo,
            horas: Math.max(0.5, Math.min(24, params.horas)),
            ...(params.observacao !== undefined
              ? { observacao: params.observacao.slice(0, 240) }
              : {}),
            updatedAt: serverTimestamp(),
          });
          if (wasSemAula !== willBeSemAula) {
            void syncSemAulaConsensusVote(targetMateria, params.data, willBeSemAula);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
        return;
      }

      const id = generateDocId('flt');
      const payload: UserFalta = {
        id,
        userId: uid,
        materiaId: params.materiaId,
        data: params.data,
        diaSemana: params.diaSemana,
        horas: Math.max(0.5, Math.min(24, params.horas)),
        tipo: params.tipo,
        ...(params.observacao ? { observacao: params.observacao.slice(0, 240) } : {}),
      };

      if (!firebaseUser) {
        const next = [...faltas, payload];
        setFaltas(next);
        syncLocal(materias, next);
        if (params.tipo === 'sem_aula') {
          void syncSemAulaConsensusVote(targetMateria, params.data, true);
        }
        return;
      }

      const path = `users/${firebaseUser.uid}/faltas/${id}`;
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid, 'faltas', id), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (params.tipo === 'sem_aula') {
          void syncSemAulaConsensusVote(targetMateria, params.data, true);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [faltas, firebaseUser, materias, syncLocal, syncSemAulaConsensusVote]
  );

  const updateFaltaTipo = useCallback(
    async (faltaId: string, tipo: FaltaTipo) => {
      const existingFalta = faltas.find((f) => f.id === faltaId);
      const targetMateria = existingFalta
        ? materias.find((m) => m.id === existingFalta.materiaId)
        : undefined;
      const wasSemAula = existingFalta?.tipo === 'sem_aula';
      const willBeSemAula = tipo === 'sem_aula';

      if (!firebaseUser) {
        const next = faltas.map((f) => (f.id === faltaId ? { ...f, tipo } : f));
        setFaltas(next);
        syncLocal(materias, next);
        if (existingFalta && wasSemAula !== willBeSemAula) {
          void syncSemAulaConsensusVote(targetMateria, existingFalta.data, willBeSemAula);
        }
        return;
      }
      const path = `users/${firebaseUser.uid}/faltas/${faltaId}`;
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid, 'faltas', faltaId), {
          tipo,
          updatedAt: serverTimestamp(),
        });
        if (existingFalta && wasSemAula !== willBeSemAula) {
          void syncSemAulaConsensusVote(targetMateria, existingFalta.data, willBeSemAula);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [faltas, firebaseUser, materias, syncLocal, syncSemAulaConsensusVote]
  );

  const deleteFalta = useCallback(
    async (faltaId: string) => {
      const existingFalta = faltas.find((f) => f.id === faltaId);
      const targetMateria = existingFalta
        ? materias.find((m) => m.id === existingFalta.materiaId)
        : undefined;

      if (!firebaseUser) {
        const next = faltas.filter((f) => f.id !== faltaId);
        setFaltas(next);
        syncLocal(materias, next);
        if (existingFalta?.tipo === 'sem_aula') {
          void syncSemAulaConsensusVote(targetMateria, existingFalta.data, false);
        }
        return;
      }
      const path = `users/${firebaseUser.uid}/faltas/${faltaId}`;
      try {
        await deleteDoc(doc(db, 'users', firebaseUser.uid, 'faltas', faltaId));
        if (existingFalta?.tipo === 'sem_aula') {
          void syncSemAulaConsensusVote(targetMateria, existingFalta.data, false);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [faltas, firebaseUser, materias, syncLocal, syncSemAulaConsensusVote]
  );

  const bulkProgramFaltas = useCallback(
    async (
      entries: Array<{ materiaId: string; data: string; diaSemana: DiaSemana; horas: number }>
    ) => {
      if (entries.length === 0) return 0;
      const uid = firebaseUser?.uid || 'local_preview';
      const existingSet = new Set(faltas.map((f) => `${f.materiaId}__${f.data}`));
      const toCreate: UserFalta[] = entries
        .filter((e) => !existingSet.has(`${e.materiaId}__${e.data}`))
        .map((e) => ({
          id: generateDocId('simf'),
          userId: uid,
          materiaId: e.materiaId,
          data: e.data,
          diaSemana: e.diaSemana,
          horas: Math.max(0.5, Math.min(24, e.horas)),
          tipo: 'programada',
          observacao: 'Agendada via Simulador',
        }));

      if (toCreate.length === 0) return 0;

      if (!firebaseUser) {
        const next = [...faltas, ...toCreate];
        setFaltas(next);
        syncLocal(materias, next);
        return toCreate.length;
      }

      const pathPrefix = `users/${firebaseUser.uid}/faltas`;
      try {
        const batch = writeBatch(db);
        for (const item of toCreate) {
          batch.set(doc(db, pathPrefix, item.id), {
            ...item,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        return toCreate.length;
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, pathPrefix);
      }
    },
    [faltas, firebaseUser, materias, syncLocal]
  );

  // Admin operations
  const updateSemestreConfig = useCallback(
    async (nextConfig: SemestreConfig) => {
      if (!firebaseUser) {
        setSemestreConfig(nextConfig);
        syncLocal(materias, faltas, nextConfig);
        return;
      }
      const path = 'config/semestre_atual';
      try {
        await setDoc(doc(db, 'config', 'semestre_atual'), {
          id: nextConfig.id.slice(0, 32),
          nome: nextConfig.nome.slice(0, 120),
          dataInicio: nextConfig.dataInicio,
          dataFim: nextConfig.dataFim,
          feriados: nextConfig.feriados.slice(0, 60),
          updatedAt: serverTimestamp(),
          updatedBy: firebaseUser.uid,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [faltas, firebaseUser, materias, syncLocal]
  );

  const publishCatalogUpdate = useCallback(
    async (nextSemestre: SemestreConfig, nextDisciplinas: CatalogoDisciplina[]) => {
      if (!firebaseUser) {
        setSemestreConfig(nextSemestre);
        setCatalogo(nextDisciplinas);
        syncLocal(materias, faltas, nextSemestre, nextDisciplinas);
        return;
      }
      try {
        await setDoc(doc(db, 'config', 'semestre_atual'), {
          id: nextSemestre.id.slice(0, 32),
          nome: nextSemestre.nome.slice(0, 120),
          dataInicio: nextSemestre.dataInicio,
          dataFim: nextSemestre.dataFim,
          feriados: nextSemestre.feriados.slice(0, 60),
          updatedAt: serverTimestamp(),
          updatedBy: firebaseUser.uid,
        });

        // Remove obsolete items and upsert new ones
        const nextIds = new Set(nextDisciplinas.map((d) => d.id));
        const toDelete = catalogo.filter((c) => !nextIds.has(c.id));

        for (let i = 0; i < toDelete.length; i += 400) {
          const batch = writeBatch(db);
          for (const rem of toDelete.slice(i, i + 400)) {
            batch.delete(doc(db, 'catalogo_disciplinas', rem.id));
          }
          await batch.commit();
        }

        for (let i = 0; i < nextDisciplinas.length; i += 400) {
          const batch = writeBatch(db);
          for (const item of nextDisciplinas.slice(i, i + 400)) {
            const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
            batch.set(doc(db, 'catalogo_disciplinas', safeId), {
              id: safeId,
              semestreId: nextSemestre.id.slice(0, 32),
              nome: item.nome.slice(0, 160),
              local: (item.local || '').slice(0, 160),
              periodo: item.periodo,
              horarios: item.horarios.slice(0, 7),
              divisaoDiferente: Boolean(item.divisaoDiferente),
              cargaHorariaTotal: Math.max(1, Math.min(1000, item.cargaHorariaTotal)),
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'catalogo_disciplinas');
      }
    },
    [catalogo, faltas, firebaseUser, materias, syncLocal]
  );

  const isAdmin = Boolean(
    firebaseUser?.emailVerified && firebaseUser?.email === ADMIN_EMAIL
  );

  const publishAvisoColetivo = useCallback(
    async (params: {
      materia: UserMateria;
      data: string;
      tipo: AvisoColetivoTipo;
      mensagem: string;
    }) => {
      const disciplinaKey = resolveDisciplinaKey(params.materia);
      const id = generateDocId('avs');
      const msg = params.mensagem.trim().slice(0, 240);
      if (msg.length < 2) return;

      const autorNome = sanitizeAuthorDisplayName(
        userProfile?.displayName || firebaseUser?.displayName,
        firebaseUser?.email
      );

      const payload: AvisoColetivo = {
        id,
        disciplinaKey,
        disciplinaNome: params.materia.nome.slice(0, 160),
        semestreId: semestreConfig.id.slice(0, 32),
        data: params.data,
        tipo: params.tipo,
        mensagem: msg,
        autorUid: firebaseUser?.uid || 'local_preview',
        autorNome,
        isOficial: isAdmin,
        confirmacoes: 1,
      };

      if (!firebaseUser) {
        const nextAvisos = [payload, ...rawAvisos];
        const nextConfirmed = [...confirmedAvisoIds, id];
        setRawAvisos(nextAvisos);
        setConfirmedAvisoIds(nextConfirmed);
        syncLocal(materias, faltas, undefined, undefined, undefined, nextAvisos, nextConfirmed);
        if (params.tipo === 'sem_aula') {
          void syncSemAulaConsensusVote(params.materia, params.data, true);
        }
        return;
      }

      const path = `avisos_coletivos/${id}`;
      try {
        await ensureCommunityEnrollment(
          firebaseUser.uid,
          disciplinaKey,
          params.materia.nome,
          semestreConfig.id,
          params.materia.catalogoId
        );
        await setDoc(doc(db, 'avisos_coletivos', id), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (params.tipo === 'sem_aula') {
          void syncSemAulaConsensusVote(params.materia, params.data, true);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [
      confirmedAvisoIds,
      ensureCommunityEnrollment,
      faltas,
      firebaseUser,
      isAdmin,
      materias,
      rawAvisos,
      semestreConfig.id,
      syncLocal,
      syncSemAulaConsensusVote,
      userProfile?.displayName,
    ]
  );

  const confirmAvisoColetivo = useCallback(
    async (avisoId: string) => {
      if (!firebaseUser) {
        if (confirmedAvisoIds.includes(avisoId)) return;
        const nextAvisos = rawAvisos.map((a) =>
          a.id === avisoId ? { ...a, confirmacoes: a.confirmacoes + 1 } : a
        );
        const nextConfirmed = [...confirmedAvisoIds, avisoId];
        setRawAvisos(nextAvisos);
        setConfirmedAvisoIds(nextConfirmed);
        syncLocal(materias, faltas, undefined, undefined, undefined, nextAvisos, nextConfirmed);
        return;
      }

      const avisoRef = doc(db, 'avisos_coletivos', avisoId);
      const confRef = doc(db, 'avisos_coletivos', avisoId, 'confirmacoes', firebaseUser.uid);
      try {
        await runTransaction(db, async (tx) => {
          const [avisoSnap, confSnap] = await Promise.all([tx.get(avisoRef), tx.get(confRef)]);
          if (!avisoSnap.exists() || confSnap.exists()) return;
          tx.set(confRef, {
            userId: firebaseUser.uid,
            avisoId,
            createdAt: serverTimestamp(),
          });
          const cur = Number(avisoSnap.data()?.confirmacoes) || 1;
          tx.update(avisoRef, {
            confirmacoes: cur + 1,
            updatedAt: serverTimestamp(),
          });
        });
        setConfirmedAvisoIds((prev) => (prev.includes(avisoId) ? prev : [...prev, avisoId]));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `avisos_coletivos/${avisoId}`);
      }
    },
    [confirmedAvisoIds, faltas, firebaseUser, materias, rawAvisos, syncLocal]
  );

  const deleteAvisoColetivo = useCallback(
    async (avisoId: string) => {
      if (!firebaseUser) {
        const nextAvisos = rawAvisos.filter((a) => a.id !== avisoId);
        setRawAvisos(nextAvisos);
        syncLocal(materias, faltas, undefined, undefined, undefined, nextAvisos);
        return;
      }

      const path = `avisos_coletivos/${avisoId}`;
      try {
        await deleteDoc(doc(db, 'avisos_coletivos', avisoId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [faltas, firebaseUser, materias, rawAvisos, syncLocal]
  );

  const addEvento = useCallback(
    async (params: {
      materia?: UserMateria;
      disciplinaNome?: string;
      data: string;
      tipo: UserEventoTipo;
      titulo: string;
      detalhes?: string;
      grupo?: string;
      horario?: string;
    }) => {
      const uid = firebaseUser?.uid || 'local_preview';
      const id = generateDocId('evt');
      const titulo = params.titulo.trim().slice(0, 160);
      if (titulo.length < 2) return;
      const disciplinaNome = (
        params.materia?.nome ||
        params.disciplinaNome ||
        'Disciplina'
      )
        .trim()
        .slice(0, 160);
      const disciplinaKey = params.materia
        ? resolveDisciplinaKey(params.materia)
        : slugifyDisciplinaNome(disciplinaNome);
      const detalhes = params.detalhes?.trim().slice(0, 240);
      const grupo = params.grupo?.trim().slice(0, 100);
      const horario = params.horario?.trim().slice(0, 16);

      const payload: UserEvento = {
        id,
        userId: uid,
        ...(params.materia ? { materiaId: params.materia.id } : {}),
        disciplinaKey,
        disciplinaNome,
        semestreId: semestreConfig.id.slice(0, 32),
        data: params.data,
        tipo: params.tipo,
        titulo,
        ...(detalhes ? { detalhes } : {}),
        ...(grupo ? { grupo } : {}),
        ...(horario ? { horario } : {}),
      };

      if (!firebaseUser) {
        const nextEventos = [...eventos, payload];
        setEventos(nextEventos);
        syncLocal(materias, faltas, undefined, undefined, undefined, undefined, undefined, nextEventos);
        return payload;
      }

      const path = `users/${firebaseUser.uid}/eventos/${id}`;
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid, 'eventos', id), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return payload;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [eventos, faltas, firebaseUser, materias, semestreConfig.id, syncLocal]
  );

  const deleteEvento = useCallback(
    async (eventoId: string) => {
      if (!firebaseUser) {
        const nextEventos = eventos.filter((e) => e.id !== eventoId);
        setEventos(nextEventos);
        syncLocal(materias, faltas, undefined, undefined, undefined, undefined, undefined, nextEventos);
        return;
      }

      const path = `users/${firebaseUser.uid}/eventos/${eventoId}`;
      try {
        await deleteDoc(doc(db, 'users', firebaseUser.uid, 'eventos', eventoId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [eventos, faltas, firebaseUser, materias, syncLocal]
  );

  const updateUserPreferences = useCallback(
    async (updates: {
      displayName?: string;
      periodoAtual?: PeriodoId;
      percentualPadrao?: number;
    }) => {
      const nextDisplayName =
        updates.displayName !== undefined
          ? sanitizeAuthorDisplayName(updates.displayName, firebaseUser?.email)
          : userProfile?.displayName || 'Estudante';
      const nextPeriodo = updates.periodoAtual ?? userProfile?.periodoAtual;
      const nextPercentual =
        updates.percentualPadrao !== undefined
          ? Math.max(1, Math.min(99, Math.round(updates.percentualPadrao)))
          : userProfile?.percentualPadrao ?? 25;

      if (!firebaseUser) {
        const updatedAvisos = rawAvisos.map((a) =>
          a.autorUid === 'local_preview' ? { ...a, autorNome: nextDisplayName } : a
        );
        setUserProfile((prev) => ({
          uid: prev?.uid || 'local_preview',
          email: prev?.email || 'Preview local (sem e-mail)',
          displayName: nextDisplayName,
          role: 'student',
          ...(nextPeriodo ? { periodoAtual: nextPeriodo } : {}),
          percentualPadrao: nextPercentual,
        }));
        setRawAvisos(updatedAvisos);
        syncLocal(
          materias,
          faltas,
          undefined,
          undefined,
          undefined,
          updatedAvisos,
          undefined,
          undefined,
          undefined,
          {
            displayName: nextDisplayName,
            periodoAtual: nextPeriodo,
            percentualPadrao: nextPercentual,
          }
        );
        return;
      }

      const path = `users/${firebaseUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          displayName: nextDisplayName.slice(0, 120),
          email: (firebaseUser.email || userProfile?.email || '').slice(0, 200),
          ...(nextPeriodo ? { periodoAtual: nextPeriodo } : {}),
          percentualPadrao: nextPercentual,
          updatedAt: serverTimestamp(),
        });
        await updateFirebaseDisplayName(nextDisplayName);

        // Propagate updated displayName onto user's own active collective notices
        const myAvisos = rawAvisos.filter(
          (a) => a.autorUid === firebaseUser.uid && a.autorNome !== nextDisplayName
        );
        if (myAvisos.length > 0) {
          const batch = writeBatch(db);
          for (const av of myAvisos.slice(0, 100)) {
            batch.update(doc(db, 'avisos_coletivos', av.id), {
              autorNome: nextDisplayName,
              updatedAt: serverTimestamp(),
            });
          }
          await batch.commit();
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [
      faltas,
      firebaseUser,
      materias,
      rawAvisos,
      syncLocal,
      userProfile?.displayName,
      userProfile?.email,
      userProfile?.percentualPadrao,
      userProfile?.periodoAtual,
    ]
  );

  const applyDefaultPercentualAll = useCallback(
    async (percentual: number) => {
      const clamped = Math.max(1, Math.min(99, Math.round(percentual)));
      if (materias.length === 0) return 0;

      if (!firebaseUser) {
        const next = materias.map((m) => ({ ...m, percentualLimite: clamped }));
        setMaterias(next);
        syncLocal(next, faltas);
        return next.length;
      }

      const path = `users/${firebaseUser.uid}/materias`;
      try {
        const batch = writeBatch(db);
        for (const m of materias) {
          batch.update(doc(db, path, m.id), {
            percentualLimite: clamped,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        return materias.length;
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [faltas, firebaseUser, materias, syncLocal]
  );

  const importPreviewDataToCloud = useCallback(async () => {
    if (!firebaseUser) return { importedMaterias: 0, importedFaltas: 0, importedEventos: 0 };
    const stored = readLocalState();
    if (!stored) return { importedMaterias: 0, importedFaltas: 0, importedEventos: 0 };

    const existingByCatOrName = new Map<string, string>();
    for (const m of materias) {
      if (m.catalogoId) existingByCatOrName.set(`cat:${m.catalogoId}`, m.id);
      existingByCatOrName.set(`key:${resolveDisciplinaKey(m)}`, m.id);
    }

    const oldToNewMateriaId = new Map<string, string>();
    const newMaterias: UserMateria[] = [];

    for (const m of stored.materias || []) {
      const existingId =
        (m.catalogoId ? existingByCatOrName.get(`cat:${m.catalogoId}`) : undefined) ||
        existingByCatOrName.get(`key:${resolveDisciplinaKey(m)}`);
      if (existingId) {
        oldToNewMateriaId.set(m.id, existingId);
      } else {
        const nextId = generateDocId('mat');
        oldToNewMateriaId.set(m.id, nextId);
        newMaterias.push({
          ...m,
          id: nextId,
          userId: firebaseUser.uid,
          disciplinaKey: resolveDisciplinaKey(m),
        });
      }
    }

    const existingFaltaKeys = new Set(faltas.map((f) => `${f.materiaId}__${f.data}`));
    const newFaltas: UserFalta[] = [];
    for (const f of stored.faltas || []) {
      const mappedMatId = oldToNewMateriaId.get(f.materiaId);
      if (!mappedMatId) continue;
      if (existingFaltaKeys.has(`${mappedMatId}__${f.data}`)) continue;
      existingFaltaKeys.add(`${mappedMatId}__${f.data}`);
      newFaltas.push({
        ...f,
        id: generateDocId('flt'),
        userId: firebaseUser.uid,
        materiaId: mappedMatId,
      });
    }

    const existingEventoKeys = new Set(eventos.map((e) => `${e.data}__${e.tipo}__${e.titulo}`));
    const newEventos: UserEvento[] = [];
    for (const ev of stored.eventos || []) {
      if (existingEventoKeys.has(`${ev.data}__${ev.tipo}__${ev.titulo}`)) continue;
      const mappedMatId = ev.materiaId ? oldToNewMateriaId.get(ev.materiaId) : undefined;
      newEventos.push({
        ...ev,
        id: generateDocId('evt'),
        userId: firebaseUser.uid,
        ...(mappedMatId ? { materiaId: mappedMatId } : {}),
      });
    }

    try {
      const batch = writeBatch(db);
      for (const m of newMaterias) {
        batch.set(doc(db, 'users', firebaseUser.uid, 'materias', m.id), {
          ...m,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const f of newFaltas) {
        batch.set(doc(db, 'users', firebaseUser.uid, 'faltas', f.id), {
          ...f,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      for (const ev of newEventos) {
        batch.set(doc(db, 'users', firebaseUser.uid, 'eventos', ev.id), {
          ...ev,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();

      for (const m of newMaterias) {
        const key = resolveDisciplinaKey(m);
        syncedKeysRef.current.add(`${firebaseUser.uid}:${key}`);
        void ensureCommunityEnrollment(
          firebaseUser.uid,
          key,
          m.nome,
          m.semestreId,
          m.catalogoId
        );
      }

      writeLocalState({ ...stored, migratedToCloudUid: firebaseUser.uid });
      setHasLocalPreviewToMigrate(false);
      return {
        importedMaterias: newMaterias.length,
        importedFaltas: newFaltas.length,
        importedEventos: newEventos.length,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
    }
  }, [ensureCommunityEnrollment, eventos, faltas, firebaseUser, materias]);

  const dismissLocalMigrationBanner = useCallback(() => {
    if (!firebaseUser) return;
    const stored = readLocalState();
    if (stored) {
      writeLocalState({ ...stored, migratedToCloudUid: firebaseUser.uid });
    }
    setHasLocalPreviewToMigrate(false);
  }, [firebaseUser]);

  const avisosColetivos = useMemo(() => {
    const filtered = filterAvisosForMaterias(rawAvisos, materias);
    const confSet = new Set(confirmedAvisoIds);
    return filtered.map((a) => ({
      ...a,
      confirmadoPorMim: confSet.has(a.id) || a.autorUid === (firebaseUser?.uid || 'local_preview'),
    }));
  }, [confirmedAvisoIds, firebaseUser?.uid, materias, rawAvisos]);

  return {
    authReady,
    firebaseUser,
    userProfile,
    isAdmin,
    previewMode,
    enterPreviewMode,
    exitPreviewMode,
    hasLocalPreviewToMigrate,
    importPreviewDataToCloud,
    dismissLocalMigrationBanner,
    loadingData,
    todayStr,
    semestreConfig,
    catalogo,
    materias,
    faltas,
    eventos,
    comunidadeMap,
    semAulaConsensoMap,
    avisosColetivos,
    importPeriodo,
    addMateria,
    updateMateria,
    deleteMateria,
    recordFalta,
    updateFaltaTipo,
    deleteFalta,
    bulkProgramFaltas,
    addEvento,
    deleteEvento,
    publishAvisoColetivo,
    confirmAvisoColetivo,
    deleteAvisoColetivo,
    updateUserPreferences,
    applyDefaultPercentualAll,
    updateSemestreConfig,
    publishCatalogUpdate,
  };
}
