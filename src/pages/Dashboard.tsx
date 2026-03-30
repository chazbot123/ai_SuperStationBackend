import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useDataStore } from "@/store/dataStore";
import { useT } from "@/i18n/useT";

export default function Dashboard() {
  const t = useT();
  usePageMeta(t("page.dashboard"));

  const user = useAuthStore((s) => s.user);
  const agents = useDataStore((s) => s.agents);
  const submissions = useDataStore((s) => s.submissions);

  const pending = submissions.filter((s) => s.status === "submitted");
  const keywordCount = useDataStore((s) => s.items.length);
  const today = new Date().toISOString().slice(0, 10);
  const todaySubCount = submissions.filter((s) => s.createdAt.slice(0, 10) === today).length;

  const showPending = user?.roleKey === "super_admin" || user?.roleKey === "operator";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.stats.agents")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-100">{agents.length}</div>
            <div className="text-xs text-zinc-400">{t("dashboard.stats.agentsHint")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.stats.keywords")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-100">{keywordCount}</div>
            <div className="text-xs text-zinc-400">{t("dashboard.stats.keywordsHint")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.stats.pending")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-100">{pending.length}</div>
            <div className="text-xs text-zinc-400">{t("dashboard.stats.pendingHint")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.stats.today")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-100">{todaySubCount}</div>
            <div className="text-xs text-zinc-400">{t("dashboard.stats.todayHint")}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("dashboard.quick.title")}</CardTitle>
            <div className="text-xs text-zinc-400">{t("dashboard.quick.hint")}</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Link to="/agents">
              <Button variant="secondary">{t("dashboard.quick.agents")}</Button>
            </Link>
            <Link to="/keyword-rules">
              <Button variant="secondary">{t("dashboard.quick.rules")}</Button>
            </Link>
            <Link to="/keyword-reviews">
              <Button variant="secondary">{t("dashboard.quick.reviews")}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("dashboard.pending.title")}</CardTitle>
            <Link to="/keyword-reviews">
              <Button variant="ghost" size="sm">
                {t("dashboard.pending.viewAll")}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {!showPending ? (
            <div className="text-sm text-zinc-300">{t("dashboard.pending.noGlobal")}</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-zinc-300">{t("dashboard.pending.none")}</div>
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>ID</Th>
                    <Th>{t("common.time")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th className="text-right">{t("common.actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {pending.slice(0, 5).map((s) => (
                    <Tr key={s.id}>
                      <Td className="font-medium">{s.displayId}</Td>
                      <Td className="text-zinc-400">{new Date(s.createdAt).toLocaleString()}</Td>
                      <Td>
                        <Badge variant="amber">{t("dashboard.stats.pending")}</Badge>
                      </Td>
                      <Td className="text-right">
                        <Link to="/keyword-reviews">
                          <Button size="sm" variant="secondary">
                            {t("dashboard.pending.toReview")}
                          </Button>
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
