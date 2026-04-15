import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveUser } from "@/hooks/useEffectiveUser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { formatBrasilia } from "@/lib/utils";
import { ptBR } from "date-fns/locale";

export default function Reviews() {
  const { user } = useAuth();
  const { effectiveUserId } = useEffectiveUser();
  const userId = effectiveUserId || user?.id;

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*, clients(full_name), appointments(start_at, services(name))")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "—";

  const ratingCounts = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter((r: any) => r.rating === star).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Avaliações</h1>
        <p className="text-muted-foreground">Feedback dos seus clientes após atendimento</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Nota Média</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-4xl font-bold">{avgRating}</span>
              <Star className="w-8 h-8 text-yellow-500 fill-yellow-500" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{reviews.length} avaliações</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Distribuição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ratingCounts.map(({ star, count }) => (
              <div key={star} className="flex items-center gap-2 text-sm">
                <span className="w-4">{star}</span>
                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 rounded-full"
                    style={{ width: reviews.length > 0 ? `${(count / reviews.length) * 100}%` : "0%" }}
                  />
                </div>
                <span className="w-6 text-muted-foreground">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Todas as Avaliações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nenhuma avaliação ainda</p>
          ) : (
            <div className="space-y-4">
              {reviews.map((review: any) => (
                <div key={review.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{review.clients?.full_name}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star
                          key={s}
                          className={`w-4 h-4 ${s <= review.rating ? "text-yellow-500 fill-yellow-500" : "text-muted"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {review.appointments?.services?.name} — {format(new Date(review.appointments?.start_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                  {review.comment && (
                    <p className="text-sm italic">"{review.comment}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
