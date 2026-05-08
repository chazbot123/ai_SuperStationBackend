import Badge from "@/components/ui/Badge";
import type { ReviewListStatus } from "@/pages/reviewCenter/reviewCenterModels";

export default function ReviewStatusBadge({ status }: { status: ReviewListStatus }) {
  if (status === "approved") {
    return <Badge variant="green">已通过</Badge>;
  }

  if (status === "rejected") {
    return <Badge variant="red">已驳回</Badge>;
  }

  return <Badge variant="amber">待审核</Badge>;
}
