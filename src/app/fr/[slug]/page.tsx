import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  return {
    title: slug,
  };
}

export async function Page({ params }: PageProps) {
  const { slug } = await params;

  return null;
}
