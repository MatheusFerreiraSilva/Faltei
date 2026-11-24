import React, { useState } from 'react';
import { ArrowRight, Mail, Sparkles } from 'lucide-react';
import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  resetUserPassword,
} from '../lib/firebase';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthScreenProps {
  onEnterPreview: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onEnterPreview }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleGoogle = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao entrar com Google.';
      setErrorMsg(
        msg.includes('popup-closed-by-user')
          ? 'Login cancelado antes de concluir.'
          : `Não foi possível entrar com Google: ${msg}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    if (!email.trim() || password.length < 6) {
      setErrorMsg('Informe um e-mail válido e senha com pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, displayName || email.split('@')[0]);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Erro de autenticação.';
      if (raw.includes('operation-not-allowed')) {
        setErrorMsg(
          'Login por E-mail/Senha ainda não foi habilitado no Firebase Console deste projeto. Use "Entrar com Google" ou habilite o provedor no console.'
        );
      } else if (raw.includes('invalid-credential') || raw.includes('wrong-password')) {
        setErrorMsg('E-mail ou senha incorretos.');
      } else if (raw.includes('email-already-in-use')) {
        setErrorMsg('Este e-mail já possui conta. Troque para "Entrar".');
      } else {
        setErrorMsg(raw);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    if (!email.trim()) {
      setErrorMsg('Digite seu e-mail acima para enviarmos o link de redefinição de senha.');
      return;
    }
    setLoading(true);
    try {
      await resetUserPassword(email);
      setInfoMsg(`Link de recuperação enviado para ${email.trim()}. Confira sua caixa de entrada.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Não foi possível enviar o link: ${err.message}`
          : 'Erro ao solicitar redefinição de senha.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E6E9F0] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Editorial Intro Bento */}
        <div className="lg:col-span-6 bento-card p-6 sm:p-9 flex flex-col justify-between bg-white">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/icon-unirio-signed.svg"
                  alt="faltei. Medicina UNIRIO"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl shadow-sm shrink-0"
                />
                <div>
                  <span className="text-3xl font-black tracking-tight text-[#0E1A59] block leading-none">
                    faltei<span className="text-[#EC1580]">.</span>
                  </span>
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#475569]">
                    Medicina UNIRIO · 2026.2
                  </span>
                </div>
              </div>
              <PWAInstallButton variant="compact" />
            </div>

            <div className="space-y-3 pt-1">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0E1A59] leading-tight text-balance">
                Seu orçamento estratégico de faltas, sem surpresas na pauta.
              </h1>
              <p className="text-sm sm:text-base text-[#475569] leading-relaxed">
                Gerencie presenças, programe folgas com impacto calculado em tempo real e acompanhe
                cada matéria da Medicina UNIRIO 2026.2 no limite exato da regra.
              </p>
            </div>
          </div>

          <div className="pt-7 mt-7 border-t-[1.5px] border-[#CBD5E1] grid grid-cols-3 gap-3 text-left">
            <div>
              <p className="font-mono tabular-nums text-2xl font-extrabold text-[#0E1A59]">86</p>
              <p className="text-xs font-semibold text-[#475569]">Matérias 2026.2</p>
            </div>
            <div>
              <p className="font-mono tabular-nums text-2xl font-extrabold text-[#0E1A59]">3</p>
              <p className="text-xs font-semibold text-[#475569]">Regras de cálculo</p>
            </div>
            <div>
              <p className="font-mono tabular-nums text-2xl font-extrabold text-[#EC1580]">25%</p>
              <p className="text-xs font-semibold text-[#475569]">Teto monitorado</p>
            </div>
          </div>
        </div>

        {/* Auth Card */}
        <div className="lg:col-span-6 bento-card p-6 sm:p-9 flex flex-col justify-between bg-white">
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-extrabold text-[#0E1A59]">Acesse sua grade</h2>
              <p className="text-xs font-semibold text-[#475569] mt-1">
                Sincronize suas faltas em qualquer dispositivo ou comece no preview local.
              </p>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogle}
              className="w-full min-h-[46px] rounded-2xl bg-[#0E1A59] text-white text-sm font-extrabold flex items-center justify-center gap-2.5 hover:bg-[#14267D] active:scale-[0.99] transition-all disabled:opacity-60"
            >
              <span>Entrar com Google</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-[1.5px] flex-1 bg-[#CBD5E1]" />
              <span className="text-xs font-bold text-[#475569]">ou use e-mail</span>
              <div className="h-[1.5px] flex-1 bg-[#CBD5E1]" />
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#E6E9F0] border border-[#CBD5E1]">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                }}
                className={`min-h-[38px] rounded-lg text-xs font-extrabold transition-colors ${
                  mode === 'login' ? 'bg-white text-[#0E1A59] shadow-sm' : 'text-[#475569]'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg(null);
                }}
                className={`min-h-[38px] rounded-lg text-xs font-extrabold transition-colors ${
                  mode === 'register' ? 'bg-white text-[#0E1A59] shadow-sm' : 'text-[#475569]'
                }`}
              >
                Criar conta
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              {mode === 'register' && (
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-bold text-[#475569] mb-1">
                    Seu nome
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex.: Mariana Silva"
                    className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3.5 text-sm font-semibold text-[#0E1A59] focus:outline-none focus:border-[#0E1A59]"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-bold text-[#475569] mb-1">
                  E-mail acadêmico ou pessoal
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@edu.unirio.br"
                  className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3.5 text-sm font-semibold text-[#0E1A59] focus:outline-none focus:border-[#0E1A59]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="auth-pass" className="block text-xs font-bold text-[#475569]">
                    Senha
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleResetPassword}
                      className="text-[11px] font-extrabold text-[#EC1580] hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <input
                  id="auth-pass"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white px-3.5 text-sm font-semibold text-[#0E1A59] focus:outline-none focus:border-[#0E1A59]"
                />
              </div>

              {errorMsg && (
                <p role="alert" className="text-xs font-bold text-[#EC1580] bg-[#FCE7F3] rounded-xl p-3">
                  {errorMsg}
                </p>
              )}

              {infoMsg && (
                <p role="status" className="text-xs font-bold text-[#15803D] bg-[#DCFCE7] rounded-xl p-3">
                  {infoMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl border-[1.5px] border-[#CBD5E1] bg-white text-[#0E1A59] text-sm font-extrabold flex items-center justify-center gap-2 hover:border-[#94A3B8] hover:bg-slate-50 active:scale-[0.99] transition-all disabled:opacity-60"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                <span>{mode === 'login' ? 'Entrar com e-mail' : 'Cadastrar e entrar'}</span>
              </button>
            </form>
          </div>

          <div className="pt-5 mt-5 border-t-[1.5px] border-[#CBD5E1]">
            <button
              type="button"
              onClick={onEnterPreview}
              className="w-full min-h-[44px] rounded-xl bg-[#E6E9F0] text-[#0E1A59] text-xs font-extrabold flex items-center justify-center gap-2 hover:bg-slate-300/60 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#EC1580]" aria-hidden="true" />
              <span>Explorar sem conta (Preview local 2026.2)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
