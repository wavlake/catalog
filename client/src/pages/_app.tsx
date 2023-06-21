import { AuthProvider } from "@/auth/authContext";
import { QueryClient, QueryClientProvider } from "react-query";
import Head from "next/head";

const queryClient = new QueryClient();

export default function MyApp({ Component, pageProps }: any) {
  // The Component prop is the active page, so whenever you navigate between routes
  // Component will change to the new page.
  // Therefore, any props you send to Component will be received by the page.

  return (
    <>
      <Head>
        <title>Wavlake • Studio</title>
      </Head>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Component {...pageProps} />
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}
