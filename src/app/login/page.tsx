import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar | Anderson Cardozo" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const notice =
    erro === "acesso"
      ? "Sua conta não tem acesso liberado: o perfil ainda não foi ativado, não está vinculado a um escritório ou a assinatura do escritório está inativa. Fale com o administrador do seu escritório."
      : undefined;

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 rounded-t-xl bg-navy px-6 py-5 text-center">
          <div className="font-serif text-2xl font-bold text-white">Anderson Cardozo</div>
          <div className="mt-0.5 text-[9px] tracking-[0.22em] text-slate-300">ASSESSORIA CONTÁBIL</div>
        </div>
        <div className="-mt-6 rounded-b-xl border border-line bg-white p-6 pt-8 shadow-card">
          <h1 className="mb-1 text-lg font-semibold text-navy">Acesse sua conta</h1>
          <p className="mb-5 text-sm text-slate-500">Use o e-mail e a senha fornecidos pelo administrador.</p>
          <LoginForm notice={notice} />
        </div>
      </div>
    </div>
  );
}
