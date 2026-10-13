"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Field, Input } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      {notice && (
        <p role="alert" className="rounded-md border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning">
          {notice}
        </p>
      )}
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Entrar
      </Button>
    </form>
  );
}
