import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type GenerationPageFrameProps = {
  title: string;
  description: string;
  badgeLabel: string;
  editorTitle?: string;
  editorDescription?: string;
  editorActions?: ReactNode;
  editorContent: ReactNode;
  resultTitle?: string;
  resultDescription?: string;
  resultActions?: ReactNode;
  resultContent: ReactNode;
  footerContent?: ReactNode;
};

export default function GenerationPageFrame({
  title,
  description,
  badgeLabel,
  editorTitle,
  editorDescription,
  editorActions,
  editorContent,
  resultTitle,
  resultDescription,
  resultActions,
  resultContent,
  footerContent,
}: GenerationPageFrameProps) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-white/10 bg-[#091224] shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
        <CardHeader className="border-white/10 bg-[#111d31]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                {title}
              </CardTitle>
              <div className="mt-2 text-sm text-zinc-400">{description}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="blue">{badgeLabel}</Badge>
              <Link to="/studio/drafts">
                <Button variant="secondary" size="sm">打开草稿箱</Button>
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 bg-[#091224] p-4 xl:p-5">
          <section>
            {(editorTitle || editorDescription || editorActions) && (
              <div className="mb-3 flex flex-col gap-2 px-1 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  {editorTitle && <div className="text-base font-semibold text-zinc-100">{editorTitle}</div>}
                  {editorDescription && <div className="mt-1 text-sm text-zinc-400">{editorDescription}</div>}
                </div>
                {editorActions}
              </div>
            )}
            <div>{editorContent}</div>
          </section>

          <section>
            {(resultTitle || resultDescription || resultActions) && (
              <div className="mb-3 flex flex-col gap-2 px-1 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  {resultTitle && <div className="text-base font-semibold text-zinc-100">{resultTitle}</div>}
                  {resultDescription && <div className="mt-1 text-sm text-zinc-400">{resultDescription}</div>}
                </div>
                {resultActions}
              </div>
            )}
            <div>{resultContent}</div>
          </section>

          {footerContent}
        </CardContent>
      </Card>
    </div>
  );
}
