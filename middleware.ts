import { authMiddleware } from "./lib/supabase/middleware";

export async function middleware(request: Request) {
  return authMiddleware(request as import("next/server").NextRequest);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
