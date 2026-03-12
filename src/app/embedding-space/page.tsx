import type { Metadata } from "next";

import { EmbeddingSpaceApp } from "@/components/embedding-space-app";
import { uiCopy } from "@/lib/ui-copy";

export const metadata: Metadata = {
  title: uiCopy.metadata.mapTitle,
  description: uiCopy.metadata.mapDescription,
};

export default function EmbeddingSpacePage() {
  return <EmbeddingSpaceApp />;
}
