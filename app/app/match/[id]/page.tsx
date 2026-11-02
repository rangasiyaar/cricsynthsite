import MatchSeoPage, { matchMetadata } from "@/components/MatchSeoPage";
import { matchParams } from "@/lib/build";

type P = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export const generateStaticParams = matchParams;
export const generateMetadata = async ({ params }: P) => matchMetadata((await params).id, "prediction");
export default async function Page({ params }: P) { return <MatchSeoPage id={(await params).id} kind="prediction" />; }
