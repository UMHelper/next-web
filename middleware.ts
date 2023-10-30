import { authMiddleware } from "@clerk/nextjs";
 
// This example protects all routes including api/trpc routes
// Please edit this to allow other routes to be public as needed.
// See https://clerk.com/docs/references/nextjs/auth-middleware for more information about configuring your Middleware

export default authMiddleware({
    // Ensure that locale specific sign-in pages are public
    publicRoutes: ["/", 
                "/:locale/sign-in",
                "/api(.*)",
                "/review(.*)",
                "/course(.*)",
                "/search(.*)",
                "/submit(.*)",
                ],
  });
export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
 