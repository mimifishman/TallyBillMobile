import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setExtraHeadersGetter } from "@workspace/api-client-react";
import BillPage from "@/pages/BillPage";
import NotFoundPage from "@/pages/NotFoundPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

function joinCodeFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  let path = window.location.pathname;
  if (BASE_PATH && path.startsWith(BASE_PATH)) {
    path = path.slice(BASE_PATH.length);
  }
  const match = path.match(/^\/?([A-Za-z0-9]+)/);
  return match ? match[1]!.toUpperCase() : null;
}

setExtraHeadersGetter(({ url }) => {
  // The web view is single-bill; whichever bill the URL identifies is the
  // one whose capability we attach. Per-bill API URLs (`/api/bills/...`)
  // are scoped to that same bill server-side, so the header authorizes
  // exactly the bill being viewed.
  if (!url.includes("/api/bills/")) return null;
  const code = joinCodeFromLocation();
  return code ? { "X-Join-Code": code } : null;
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={BASE_PATH}>
        <Switch>
          <Route path="/:code" component={BillPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
