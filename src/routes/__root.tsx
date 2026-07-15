import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import "../main-fonts";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/brand";
import { WelcomeGuide } from "@/components/site/WelcomeGuide";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-extrabold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الرابط الذي تحاول الوصول إليه غير متاح أو تم نقله.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground btn-primary-glow"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">حدث خطأ غير متوقع</h1>
        <p className="mt-2 text-sm text-muted-foreground">يمكنك المحاولة مرة أخرى أو العودة للصفحة الرئيسية.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground btn-primary-glow"
          >
            إعادة المحاولة
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-full border px-5 py-2.5 text-sm font-semibold">
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${BRAND.name} | حجز رحلات العمرة` },
      { name: "description", content: "رحلات عمرة منظّمة من المدينة المنورة إلى مكة المكرمة. باقات أفراد وعوائل، فنادق مختارة، حافلات حديثة، وأسعار شفافة." },
      { name: "author", content: BRAND.name },
      { name: "theme-color", content: "#1F2B3D" },
      { property: "og:title", content: `${BRAND.name} | حجز رحلات العمرة` },
      { property: "og:description", content: BRAND.tagline },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ar_SA" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Lovable App" },
      { property: "og:title", content: "Lovable App" },
      { name: "twitter:title", content: "Lovable App" },
      { property: "og:description", content: "رحلات عمرة منظّمة من المدينة المنورة إلى مكة المكرمة. باقات أفراد وعوائل، فنادق مختارة، حافلات حديثة، وأسعار شفافة." },
      { name: "twitter:description", content: "رحلات عمرة منظّمة من المدينة المنورة إلى مكة المكرمة. باقات أفراد وعوائل، فنادق مختارة، حافلات حديثة، وأسعار شفافة." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a02d24ce-3dcf-4c69-bd96-7c3650950607/id-preview-d3e5f52a--c6278a34-5890-4223-8a64-fb672dc227fe.lovable.app-1782885193347.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a02d24ce-3dcf-4c69-bd96-7c3650950607/id-preview-d3e5f52a--c6278a34-5890-4223-8a64-fb672dc227fe.lovable.app-1782885193347.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: BRAND.logoUrl, type: "image/png" },
      { rel: "apple-touch-icon", href: BRAND.logoUrl },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <WelcomeGuide />
      <Toaster richColors position="top-center" dir="rtl" />
    </QueryClientProvider>
  );
}
