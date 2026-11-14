import { Hammer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { pageTitleFor } from "@/lib/nav";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function ComingSoonPage({ params }: PageProps) {
  const { slug } = await params;
  const title = pageTitleFor(`/${slug.join("/")}`);
  if (!title) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{title}</h1>
      <EmptyState
        as="h2"
        icon={Hammer}
        title="Çok yakında"
        description="Bu ekran üzerinde çalışıyoruz. Hazır olduğunda burada görünecek."
        action={
          <Button asChild variant="secondary">
            <Link href="/">Panoya dön</Link>
          </Button>
        }
      />
    </div>
  );
}
