import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "../db/database";

export const cookieName="chaos_session";
export const sessionAge=60*60*24*14;
export const tokenPattern=/^[A-Za-z0-9_-]{43}$/;
export const newToken=()=>randomBytes(32).toString("base64url");

export function digest(value:string){
  const secret=process.env.SESSION_SECRET;
  if(!secret||secret.length<32) throw new Error("Set a SESSION_SECRET of at least 32 characters.");
  return createHmac("sha256",secret).update(value).digest("hex");
}

export function equal(a:string,b:string){
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}

export async function getUser(){
  const value=(await cookies()).get(cookieName)?.value;
  if(!value||!tokenPattern.test(value)) return null;
  return await db().prepare("SELECT user_id AS userId FROM account_sessions WHERE digest=? AND expires>?")
    .bind(digest(value),Date.now()).first<{userId:string}>()??null;
}
