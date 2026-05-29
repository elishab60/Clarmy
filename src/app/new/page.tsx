import { NewSessionView } from "@/components/views/new-session";

// Interactive client page that reads useSearchParams at runtime; opt out of
// static prerendering so the prod build does not try to export it.
export const dynamic = "force-dynamic";

export default function Page() {
  return <NewSessionView />;
}
