import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: "", priority: 1 },
    { path: "/watches", priority: 0.9 },
    { path: "/analysis", priority: 0.8 },
    { path: "/standards", priority: 0.7 },
    { path: "/export", priority: 0.7 },
    { path: "/agent", priority: 0.7 },
    { path: "/verify", priority: 0.6 },
    { path: "/settings", priority: 0.5 },
  ];

  return routes.map((route) => ({
    url: `${SITE.liveUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route.priority,
  }));
}