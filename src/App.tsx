import { useEffect, useMemo, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { BottomDock, TabKey } from './components/BottomDock';
import { ConfigModal } from './components/ConfigModal';
import { CumpliceIcon, CumpliceMood } from './components/CumpliceIcon';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MateriaDrawer } from './components/MateriaDrawer';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TabCalendario } from './components/TabCalendario';
import { TabGrade } from './components/TabGrade';
import { TabHoje } from './components/TabHoje';
import { TabMaterias } from './components/TabMaterias';
import { TabSimulador } from './components/TabSimulador';
import { TopBar } from './components/TopBar';
import { useFalteiStore } from './hooks/useFalteiStore';
import { logoutUser } from './lib/firebase';
import {
  calculateMateriaStats,
  getDiaSemanaFromIso,
  getWeekDatesIso,
  isFeriado,
} from './utils/attendance';

function FalteiAppShell() {
  const store = useFalteiStore();
  const [activeTab, setActiveTab] = useState<TabKey>('hoje');
  const [drawerMateriaId, setDrawerMateriaId] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [migratingPreview, setMigratingPreview] = useState(false);
  const [requestedCalDate, setRequestedCalDate] = useState<{
    iso: string;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  const statsList = useMemo(
    () =>
      store.materias.map((m) =>
        calculateMateriaStats(m, store.faltas, store.semestreConfig, store.todayStr)
      ),
    [store.faltas, store.materias, store.semestreConfig, store.todayStr]
  );

  const drawerStats = useMemo(
    () => statsList.find((s) => s.materia.id === drawerMateriaId) || null,
    [drawerMateriaId, statsList]
  );

  const hasUnrecordedToday = useMemo(() => {
    const dow = getDiaSemanaFromIso(store.todayStr);
    if (dow === 0 || isFeriado(store.todayStr, store.semestreConfig.feriados)) {
      return false;
    }
    const todayClasses = store.materias.filter((m) =>
      m.horarios.some((h) => h.diaSemana === dow)
    );
    if (todayClasses.length === 0) return false;
    return todayClasses.some(
      (m) => !store.faltas.some((f) => f.materiaId === m.id && f.data === store.todayStr)
    );
  }, [store.faltas, store.materias, store.semestreConfig.feriados, store.todayStr]);

  const criticalCount = useMemo(
    () => statsList.filter((s) => s.zonaCriticaTerracota).length,
    [statsList]
  );

  const globalMood: CumpliceMood = useMemo(() => {
    if (statsList.some((s) => s.status === 'ESTOURADO' || s.status === 'CRÍTICO')) {
      return 'critico';
    }
    if (statsList.some((s) => s.status === 'ATENÇÃO')) {
      return 'atencao';
    }
    const weekSet = new Set(getWeekDatesIso(store.todayStr));
    if (store.faltas.some((f) => f.tipo === 'programada' && weekSet.has(f.data))) {
      return 'programado';
    }
    const dow = getDiaSemanaFromIso(store.todayStr);
    const holiday = Boolean(isFeriado(store.todayStr, store.semestreConfig.feriados));
    const hasTodayClass =
      !holiday &&
      dow >= 1 &&
      dow <= 6 &&
      store.materias.some((m) => m.horarios.some((h) => h.diaSemana === dow));
    if (store.materias.length > 0 && !hasTodayClass) {
      return 'sem_aula';
    }
    return 'seguro';
  }, [statsList, store.faltas, store.materias, store.semestreConfig.feriados, store.todayStr]);

  if (!store.authReady) {
    return (
      <div className="min-h-screen bg-[#E6E9F0] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <CumpliceIcon mood="seguro" size={56} className="mx-auto" />
          <p className="text-2xl font-black tracking-tight text-[#0E1A59]">
            faltei<span className="text-[#EC1580]">.</span>
          </p>
          <p className="text-xs font-semibold text-[#475569]">Carregando sua grade...</p>
        </div>
      </div>
    );
  }

  if (!store.firebaseUser && !store.previewMode) {
    return <AuthScreen onEnterPreview={store.enterPreviewMode} />;
  }

  const resolvedDisplayName =
    store.userProfile?.displayName ||
    store.firebaseUser?.displayName ||
    store.firebaseUser?.email?.split('@')[0] ||
    'Estudante';

  const isPreview = !store.firebaseUser && store.previewMode;

  const handleTopAuthAction = async () => {
    if (isPreview) {
      store.exitPreviewMode();
      return;
    }
    await logoutUser();
  };

  const handleOpenCalendarioDate = (isoDate: string) => {
    setRequestedCalDate({ iso: isoDate, nonce: Date.now() });
    setActiveTab('calendario');
  };

  const handleQuickMigratePreview = async () => {
    setMigratingPreview(true);
    try {
      await store.importPreviewDataToCloud();
    } finally {
      setMigratingPreview(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E6E9F0] text-[#0E1A59]">
      <OfflineIndicator />

      <TopBar
        displayName={resolvedDisplayName}
        isPreviewMode={isPreview}
        mood={globalMood}
        onOpenConfig={() => setConfigOpen(true)}
        onAuthAction={handleTopAuthAction}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-5 pb-28 space-y-4">
        {!isPreview && store.hasLocalPreviewToMigrate && (
          <section className="bento-card p-4 bg-[#FCE7F3]/50 border-[#EC1580]/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <CloudUpload className="w-4 h-4 text-[#EC1580] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs font-bold text-[#0E1A59]">
                Você tem disciplinas, faltas ou eventos salvos no preview local deste dispositivo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={migratingPreview}
                onClick={handleQuickMigratePreview}
                className="min-h-[36px] px-3 rounded-xl bg-[#EC1580] text-white text-xs font-extrabold hover:bg-[#d11170] disabled:opacity-60 whitespace-nowrap"
              >
                {migratingPreview ? 'Sincronizando...' : 'Importar para minha conta'}
              </button>
              <button
                type="button"
                onClick={store.dismissLocalMigrationBanner}
                className="min-h-[36px] px-3 rounded-xl bg-white border border-[#CBD5E1] text-xs font-bold text-[#475569] hover:text-[#0E1A59]"
              >
                Ignorar
              </button>
            </div>
          </section>
        )}

        {store.loadingData ? (
          <div className="bento-card p-8 text-center text-xs font-semibold text-[#475569]">
            Sincronizando disciplinas e registros...
          </div>
        ) : (
          <>
            {activeTab === 'hoje' && (
              <TabHoje
                todayStr={store.todayStr}
                semestreConfig={store.semestreConfig}
                materias={store.materias}
                statsList={statsList}
                faltas={store.faltas}
                eventos={store.eventos}
                comunidadeMap={store.comunidadeMap}
                semAulaConsensoMap={store.semAulaConsensoMap}
                avisosColetivos={store.avisosColetivos}
                currentUserUid={store.firebaseUser?.uid || 'local_preview'}
                userDisplayName={resolvedDisplayName}
                isAdmin={store.isAdmin}
                heroMood={globalMood}
                onRecordFalta={store.recordFalta}
                onDeleteFalta={store.deleteFalta}
                onImportPeriodo={store.importPeriodo}
                onPublishAviso={store.publishAvisoColetivo}
                onConfirmAviso={store.confirmAvisoColetivo}
                onDeleteAviso={store.deleteAvisoColetivo}
                onOpenCalendario={() => setActiveTab('calendario')}
                onOpenCalendarioDate={handleOpenCalendarioDate}
                onOpenSimulador={() => setActiveTab('simulador')}
                onOpenGrade={() => setActiveTab('grade')}
                onOpenConfig={() => setConfigOpen(true)}
              />
            )}

            {activeTab === 'calendario' && (
              <TabCalendario
                todayStr={store.todayStr}
                semestreConfig={store.semestreConfig}
                materias={store.materias}
                faltas={store.faltas}
                eventos={store.eventos}
                comunidadeMap={store.comunidadeMap}
                semAulaConsensoMap={store.semAulaConsensoMap}
                avisosColetivos={store.avisosColetivos}
                requestedDate={requestedCalDate}
                currentUserUid={store.firebaseUser?.uid || 'local_preview'}
                isAdmin={store.isAdmin}
                onAddEvento={store.addEvento}
                onDeleteEvento={store.deleteEvento}
                onPublishAviso={store.publishAvisoColetivo}
                onConfirmAviso={store.confirmAvisoColetivo}
                onDeleteAviso={store.deleteAvisoColetivo}
                onRecordFalta={store.recordFalta}
                onDeleteFalta={store.deleteFalta}
                onOpenGrade={() => setActiveTab('grade')}
              />
            )}

            {activeTab === 'materias' && (
              <TabMaterias
                statsList={statsList}
                comunidadeMap={store.comunidadeMap}
                onSelectMateria={(id) => setDrawerMateriaId(id)}
                onOpenGrade={() => setActiveTab('grade')}
              />
            )}

            {activeTab === 'simulador' && (
              <TabSimulador
                todayStr={store.todayStr}
                semestreConfig={store.semestreConfig}
                materias={store.materias}
                faltas={store.faltas}
                onBulkProgramFaltas={store.bulkProgramFaltas}
                onOpenGrade={() => setActiveTab('grade')}
              />
            )}

            {activeTab === 'grade' && (
              <TabGrade
                isAdmin={store.isAdmin}
                isPreviewMode={isPreview}
                userProfile={store.userProfile}
                semestreConfig={store.semestreConfig}
                catalogo={store.catalogo}
                materias={store.materias}
                comunidadeMap={store.comunidadeMap}
                onImportPeriodo={store.importPeriodo}
                onAddMateria={store.addMateria}
                onDeleteMateria={store.deleteMateria}
                onSelectMateria={(id) => setDrawerMateriaId(id)}
                onOpenConfig={() => setConfigOpen(true)}
                onUpdateSemestreConfig={store.updateSemestreConfig}
                onPublishCatalogUpdate={store.publishCatalogUpdate}
              />
            )}
          </>
        )}
      </main>

      <BottomDock
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        hasUnrecordedToday={hasUnrecordedToday}
        criticalCount={criticalCount}
      />

      <MateriaDrawer
        stats={drawerStats}
        faltas={store.faltas}
        comunidadeMap={store.comunidadeMap}
        todayStr={store.todayStr}
        onClose={() => setDrawerMateriaId(null)}
        onUpdateFaltaTipo={store.updateFaltaTipo}
        onDeleteFalta={store.deleteFalta}
        onRecordFalta={store.recordFalta}
        onUpdateMateria={store.updateMateria}
        onDeleteMateria={store.deleteMateria}
      />

      <ConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        userProfile={store.userProfile}
        isPreviewMode={isPreview}
        isAdmin={store.isAdmin}
        semestreConfig={store.semestreConfig}
        materias={store.materias}
        faltas={store.faltas}
        eventos={store.eventos}
        hasLocalPreviewToMigrate={store.hasLocalPreviewToMigrate}
        onSavePreferences={store.updateUserPreferences}
        onApplyPercentualAll={store.applyDefaultPercentualAll}
        onImportPreviewToCloud={store.importPreviewDataToCloud}
        onDismissMigrationBanner={store.dismissLocalMigrationBanner}
        onAuthAction={handleTopAuthAction}
        onOpenGrade={() => setActiveTab('grade')}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <FalteiAppShell />
    </ErrorBoundary>
  );
}
