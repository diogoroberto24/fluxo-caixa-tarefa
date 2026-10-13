import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">Página não encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">O endereço acessado não existe neste sistema.</p>
        <Link href="/" className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
