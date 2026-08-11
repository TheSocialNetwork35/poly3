import type { PagesFunction } from "@cloudflare/workers-types";
import { handlePolyTrackProxy } from "../../../src/server/polytrackProxy";

export const onRequest: PagesFunction = async (context) => {
  return handlePolyTrackProxy(context.request, context.params.path);
};
