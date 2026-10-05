import SubmitCommentForm from "@/components/submit/submit-comment-form";

type SubmitPageProps = {
  params: Promise<{ code: string; prof: string }>;
};

export default async function SubmitPage({ params }: SubmitPageProps) {
  const { code, prof } = await params;
  return <SubmitCommentForm code={code} prof={prof} />;
}
