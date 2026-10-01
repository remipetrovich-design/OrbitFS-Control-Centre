import {createFileRoute} from "@tanstack/react-router";
import {protectedResourceMetadata} from "@/lib/dev-oauth.server";

export const Route=createFileRoute("/.well-known/oauth-protected-resource")({
 server:{handlers:{
  GET:async()=>Response.json(protectedResourceMetadata(),{headers:{"cache-control":"no-store"}})
 }}
});
