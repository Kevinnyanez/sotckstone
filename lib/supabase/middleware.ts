import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/sin-acceso"];
const PUBLIC_PREFIXES = ["/api/mercadolibre/callback"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

export async function authMiddleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  let userId: string | undefined;
  try {
    const { data } = await supabase.auth.getClaims();
    const user = data?.claims as { sub?: string } | undefined;
    userId = user?.sub;
  } catch (e) {
    const err = e as { __isAuthError?: boolean; code?: string };
    if (err?.__isAuthError === true || err?.code === "refresh_token_not_found") {
      await supabase.auth.signOut();
      if (!isPublicPath(request.nextUrl.pathname)) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", request.nextUrl.pathname);
        return NextResponse.redirect(loginUrl);
      }
    } else {
      throw e;
    }
  }

  if (isPublicPath(request.nextUrl.pathname)) {
    if (userId && ["/login", "/signup"].includes(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  if (!userId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.redirect(new URL("/sin-acceso", request.url));
  }

  const profileRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json"
      }
    }
  );

  const profileData = await profileRes.json();
  const role = Array.isArray(profileData) && profileData[0] ? profileData[0].role : null;

  if (role !== "admin") {
    return NextResponse.redirect(new URL("/sin-acceso", request.url));
  }

  return response;
}
