import { permanentRedirect } from "next/navigation";

import SubmitCommentForm from "@/components/submit/submit-comment-form";
import { resolveCourseCode } from "@/lib/database/course-equivalences";
import { buildSubmitPath } from "@/lib/site";

type SubmitPageProps = {
  params: Promise<{ code: string; prof: string }>;
};

export default async function SubmitPage({ params }: SubmitPageProps) {
  const { code, prof } = await params;
  const requested = code.toUpperCase();
  const primary = await resolveCourseCode(requested);

  if (primary !== requested) {
    const decodedProf = decodeURIComponent(prof).replaceAll("$", "/");
    permanentRedirect(buildSubmitPath(primary, decodedProf));
  }

  return <SubmitCommentForm code={primary} prof={prof} />;
}
