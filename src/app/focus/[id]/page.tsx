import { FocusView } from "@/components/views/focus-view";

export default async function FocusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FocusView id={id} />;
}
