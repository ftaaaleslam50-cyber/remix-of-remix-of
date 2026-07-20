import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Ticket, Loader2, Edit, Eye, XCircle, Trash2, Bus as BusIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sar } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin-bookings")({
  component: AdminBookings,
});

interface AdminBooking {
  id: string;
  booking_code: string;
  status: string;
  created_at: string;
  customer_name: string | null;
  id_number: string | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  passenger_count: number;
  seat_numbers: string[] | null;
  total_price: number;
  price_per_person: number;
  discount_amount: number;
  coupon_code: string | null;
  nationality: string | null;
  booking_source: string | null;
  trip_id: string | null;
  bus_id: string | null;
  package_id: string | null;
  no_hotel: boolean;
  no_bus: boolean;
  deleted_at: string | null;
  rep_name: string | null;

  trips: {
    name: string;
    departure_day: string;
  } | null;

  buses: {
    name: string | null;
    bus_number: number;
  } | null;

  packages: {
    name: string;
  } | null;
}

const TABS = [
  { key: "all", label: "الكل" },
  { key: "confirmed", label: "مؤكد" },
  { key: "pending", label: "قيد الانتظار" },
  { key: "cancelled", label: "ملغي" },
  { key: "deleted", label: "محذوف" },
  { key: "by-bus", label: "حسب الحافلة" },
] as const;

function AdminBookings() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [ok, setOk] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const [details, setDetails] = useState<AdminBooking | null>(null);
  const [busFilter, setBusFilter] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate({ to: "/auth" });
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setOk(!!data);
    })();
  }, [navigate]);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-bookings"],
    enabled: ok === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          id,
          booking_code,
          status,
          created_at,
          customer_name,
          id_number,
          contact_phone,
          whatsapp_phone,
          passenger_count,
          seat_numbers,
          total_price,
          price_per_person,
          discount_amount,
          coupon_code,
          nationality,
          booking_source,
          trip_id,
          bus_id,
          package_id,
          no_hotel,
          no_bus,
          deleted_at,
          rep_name,
          trips(name,departure_day),
          buses(name,bus_number),
          packages(name)
        `,
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(500);

      if (error) throw error;

      return (data ?? []) as unknown as AdminBooking[];
    },
  });

  const { data: buses = [] } = useQuery({
    queryKey: ["admin-buses-list"],
    enabled: ok === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("buses").select("id,name,bus_number").order("bus_number");

      if (error) throw error;

      return (data ?? []) as Array<{
        id: string;
        name: string | null;
        bus_number: number;
      }>;
    },
  });

  const filtered = useMemo(() => {
    let list = bookings;

    /*
     * تبويب المحذوف:
     * يعرض الحجوزات التي تحتوي على deleted_at
     *
     * باقي التبويبات:
     * تستبعد الحجوزات المحذوفة
     */
    if (tab === "deleted") {
      list = list.filter((b) => b.deleted_at);
    } else {
      list = list.filter((b) => !b.deleted_at);
    }

    if (tab === "confirmed") {
      list = list.filter((b) => b.status === "confirmed");
    }

    if (tab === "pending") {
      list = list.filter((b) => b.status === "pending");
    }

    if (tab === "cancelled") {
      list = list.filter((b) => b.status === "cancelled");
    }

    if (tab === "by-bus" && busFilter) {
      list = list.filter((b) => b.bus_id === busFilter);
    }

    const term = q.trim().toLowerCase();

    if (term) {
      list = list.filter((b) =>
        [b.booking_code, b.customer_name, b.contact_phone, b.whatsapp_phone, b.id_number].some((v) =>
          (v ?? "").toString().toLowerCase().includes(term),
        ),
      );
    }

    return list;
  }, [bookings, tab, q, busFilter]);

  async function updateStatus(b: AdminBooking, status: string) {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", b.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم التحديث");

    qc.invalidateQueries({
      queryKey: ["admin-bookings"],
    });

    qc.invalidateQueries({
      queryKey: ["admin-buses-booking-counts"],
    });
  }

  async function softDelete(b: AdminBooking) {
    if (!confirm(`حذف الحجز ${b.booking_code}؟`)) {
      return;
    }

    const { error } = await supabase
      .from("bookings")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", b.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم الحذف");

    qc.invalidateQueries({
      queryKey: ["admin-bookings"],
    });

    qc.invalidateQueries({
      queryKey: ["admin-buses-booking-counts"],
    });
  }

  async function restore(b: AdminBooking) {
    const { error } = await supabase
      .from("bookings")
      .update({
        deleted_at: null,
      })
      .eq("id", b.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم الاسترجاع");

    qc.invalidateQueries({
      queryKey: ["admin-bookings"],
    });

    qc.invalidateQueries({
      queryKey: ["admin-buses-booking-counts"],
    });
  }

  function editBooking(code: string) {
    localStorage.setItem("edit_booking_code", code);

    navigate({
      to: "/booking",
    });
  }

  /*
   * حساب إشغال الحافلة:
   *
   * يتم احتساب المقاعد فقط من:
   * - الحجوزات غير المحذوفة
   * - الحجوزات غير الملغاة
   * - الحجوزات المرتبطة بالحافلة المختارة
   */
  const busOccupancy = useMemo(() => {
    if (tab !== "by-bus" || !busFilter) {
      return null;
    }

    const rows = bookings.filter((b) => !b.deleted_at && b.status !== "cancelled" && b.bus_id === busFilter);

    const seats = rows.flatMap((b) => b.seat_numbers ?? []);

    return {
      count: rows.length,
      seatCount: seats.length,
      seats,
    };
  }, [tab, busFilter, bookings]);

  if (ok === false) {
    return <div className="p-8 text-center">ليس لديك صلاحية</div>;
  }

  if (ok === null) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            إدارة الحجوزات
          </h1>

          <Link to="/dashboard">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 ml-1" />
              لوحة التحكم
            </Button>
          </Link>
        </div>
      </header>

      <main className="container-luxe py-6 space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="flex flex-wrap h-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-4 flex flex-wrap gap-3">
            <Input
              placeholder="ابحث برقم الحجز، الاسم، الجوال، أو الهوية..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 min-w-[240px]"
            />

            {tab === "by-bus" && (
              <select
                value={busFilter}
                onChange={(e) => setBusFilter(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-white text-sm min-w-[220px]"
              >
                <option value="">— اختر حافلة —</option>

                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name ?? `حافلة ${b.bus_number}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {tab === "by-bus" && busOccupancy && (
            <div className="mt-3 surface-card p-4 flex flex-wrap gap-6 items-center">
              <div className="flex items-center gap-2 font-bold">
                <BusIcon className="h-4 w-4" />
                حجوزات هذه الحافلة
              </div>

              <div>
                عدد الحجوزات: <b>{busOccupancy.count}</b>
              </div>

              <div>
                عدد المقاعد المشغولة: <b>{busOccupancy.seatCount}</b>
              </div>
            </div>
          )}

          <TabsContent value={tab} className="mt-4">
            {isLoading ? (
              <div className="py-16 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="surface-card p-10 text-center text-muted-foreground">لا نتائج.</div>
            ) : (
              <div className="grid gap-3">
                {filtered.map((b) => (
                  <div key={b.id} className={`surface-card p-4 border ${b.deleted_at ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <div className="flex-1 min-w-[240px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary text-lg">{b.booking_code}</span>

                          <Badge>{b.status}</Badge>

                          {b.deleted_at && <Badge variant="destructive">محذوف</Badge>}
                        </div>

                        <div className="mt-2 text-sm grid grid-cols-1 sm:grid-cols-2 gap-1">
                          <div>
                            العميل: <b>{b.customer_name || "—"}</b>
                          </div>

                          <div>
                            الجوال: <b>{b.contact_phone || "—"}</b>
                          </div>

                          <div>
                            الفندق: <b>{b.packages?.name || (b.no_hotel ? "بدون" : "—")}</b>
                          </div>

                          <div>
                            الحافلة:{" "}
                            <b>{b.buses ? b.buses.name || `حافلة ${b.buses.bus_number}` : b.no_bus ? "بدون" : "—"}</b>
                          </div>

                          <div>
                            الرحلة: <b>{b.trips?.name || "—"}</b>
                          </div>

                          <div>
                            عدد الأفراد: <b>{b.passenger_count}</b>
                          </div>

                          {b.seat_numbers?.length ? (
                            <div className="col-span-full">
                              المقاعد: <b className="font-mono">{b.seat_numbers.join(", ")}</b>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-left space-y-2">
                        <p className="text-2xl font-extrabold text-primary">{sar(b.total_price)}</p>

                        <p className="text-xs text-muted-foreground">
                          {new Date(b.created_at).toLocaleDateString("ar")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setDetails(b)}>
                        <Eye className="h-3 w-3 ml-1" />
                        تفاصيل
                      </Button>

                      {!b.deleted_at && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => editBooking(b.booking_code)}
                          >
                            <Edit className="h-3 w-3 ml-1" />
                            تعديل
                          </Button>

                          {b.status !== "confirmed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => updateStatus(b, "confirmed")}
                            >
                              تأكيد
                            </Button>
                          )}

                          {b.status !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl"
                              onClick={() => updateStatus(b, "cancelled")}
                            >
                              <XCircle className="h-3 w-3 ml-1" />
                              إلغاء
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl text-destructive"
                            onClick={() => softDelete(b)}
                          >
                            <Trash2 className="h-3 w-3 ml-1" />
                            حذف
                          </Button>
                        </>
                      )}

                      {b.deleted_at && (
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => restore(b)}>
                          استرجاع
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل الحجز</DialogTitle>
          </DialogHeader>

          {details && (
            <Tabs defaultValue="customer">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="customer">العميل</TabsTrigger>

                <TabsTrigger value="trip">الرحلة</TabsTrigger>

                <TabsTrigger value="hotel">الفندق</TabsTrigger>

                <TabsTrigger value="bus">الحافلة</TabsTrigger>

                <TabsTrigger value="seats">المقاعد</TabsTrigger>

                <TabsTrigger value="price">السعر</TabsTrigger>

                <TabsTrigger value="rep">المندوب</TabsTrigger>

                <TabsTrigger value="meta">معلومات</TabsTrigger>
              </TabsList>

              <TabsContent value="customer" className="space-y-1 text-sm mt-3">
                <Row k="الاسم" v={details.customer_name} />

                <Row k="الهوية" v={details.id_number} />

                <Row k="الجوال" v={details.contact_phone} />

                <Row k="الواتساب" v={details.whatsapp_phone} />

                <Row k="الجنسية" v={details.nationality} />
              </TabsContent>

              <TabsContent value="trip" className="space-y-1 text-sm mt-3">
                <Row k="اسم الرحلة" v={details.trips?.name} />

                <Row k="تاريخ الذهاب" v={details.trips?.departure_day} />
              </TabsContent>

              <TabsContent value="hotel" className="space-y-1 text-sm mt-3">
                <Row k="الفندق" v={details.packages?.name || (details.no_hotel ? "بدون فندق" : "—")} />
              </TabsContent>

              <TabsContent value="bus" className="space-y-1 text-sm mt-3">
                <Row
                  k="الحافلة"
                  v={
                    details.buses
                      ? details.buses.name || `حافلة ${details.buses.bus_number}`
                      : details.no_bus
                        ? "بدون"
                        : "—"
                  }
                />
              </TabsContent>

              <TabsContent value="seats" className="space-y-1 text-sm mt-3">
                <Row k="المقاعد" v={details.seat_numbers?.join(", ") || "—"} />

                <Row k="عدد الأفراد" v={String(details.passenger_count)} />
              </TabsContent>

              <TabsContent value="price" className="space-y-1 text-sm mt-3">
                <Row k="سعر الفرد" v={sar(details.price_per_person)} />

                <Row k="الخصم" v={sar(details.discount_amount)} />

                <Row k="الكوبون" v={details.coupon_code} />

                <Row k="الإجمالي" v={sar(details.total_price)} />
              </TabsContent>

              <TabsContent value="rep" className="space-y-1 text-sm mt-3">
                <Row k="المندوب" v={details.rep_name} />
              </TabsContent>

              <TabsContent value="meta" className="space-y-1 text-sm mt-3">
                <Row k="رقم الحجز" v={details.booking_code} />

                <Row k="الحالة" v={details.status} />

                <Row k="تاريخ الحجز" v={new Date(details.created_at).toLocaleString("ar")} />

                <Row k="مصدر الحجز" v={details.booking_source} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-border/50 py-1.5">
      <span className="text-muted-foreground">{k}</span>

      <span className="font-semibold text-left">{v || "—"}</span>
    </div>
  );
}
