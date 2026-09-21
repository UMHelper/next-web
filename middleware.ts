import { authMiddleware } from "@clerk/nextjs/server";

export default authMiddleware({
  publicRoutes: [
    "/",
    "/catalog(.*)",
    "/course(.*)",
    "/professor(.*)",
    "/reviews(.*)",
    "/search(.*)",
    "/timetable(.*)",
    "/submit(.*)",
    "/privacy-policy(.*)",
    "/terms-of-service(.*)",
    "/api/(.*)",
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};