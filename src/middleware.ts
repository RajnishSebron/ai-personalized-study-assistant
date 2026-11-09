
import {
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Continue without Supabase middleware if environment variables are missing.
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },

      setAll(
        values: {
          name: string;
          value: string;
          options: CookieOptions;
        }[]
      ) {
        // Update cookies on the incoming request.
        values.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        // Create a new response with the updated request.
        response = NextResponse.next({
          request,
        });

        // Update cookies on the outgoing response.
        values.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Verify the authenticated user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Routes that require authentication.
  const protectedRoutes = [
    "/dashboard",
    "/materials",
    "/topics",
    "/quiz",
    "/reports",
    "/revision-plan",
    "/tutor",
  ];

  // Redirect unauthenticated users to login.
  if (
    !user &&
    protectedRoutes.some(
      (route) => path === route || path.startsWith(`${route}/`)
    )
  ) {
    return NextResponse.redirect(
      new URL("/login", request.url)
    );
  }

  // Redirect authenticated users away from login.
  if (user && path === "/login") {
    return NextResponse.redirect(
      new URL("/dashboard", request.url)
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
