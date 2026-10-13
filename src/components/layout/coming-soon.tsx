import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function ComingSoon({
  title,
  stage,
  description,
}: {
  title: string;
  stage: string;
  description: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      <Card className="mt-6">
        <EmptyState
          icon={Construction}
          title={`Disponível na ${stage}`}
          description={description}
        />
      </Card>
    </div>
  );
}

export function AccessRestricted({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      <Card className="mt-6">
        <EmptyState
          icon={Construction}
          title="Acesso restrito"
          description="Seu perfil não tem permissão para visualizar esta área. Fale com um administrador."
        />
      </Card>
    </div>
  );
}
