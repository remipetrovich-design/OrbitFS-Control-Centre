import {createFileRoute} from "@tanstack/react-router";
import {authorizationServerMetadata} from "@/lib/dev-oauth.server";

export const Route=createFileRoute("/.well-known/oauth-authorization-server")({
 server:{handlers:{
  GET:async()=>Response.json(authorizationServerMetadata(),{headers:{"cache-control":"no-store"}})
 }}
});
