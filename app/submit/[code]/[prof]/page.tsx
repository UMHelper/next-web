import SubmitCommentForm from "@/components/submit/submit-comment-form";

export default function SubmitPage({
  params,
}: {
  params: { code: string; prof: string };
}) {
  return <SubmitCommentForm code={params.code} prof={params.prof} />;
}
