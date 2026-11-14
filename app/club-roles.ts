import { db } from "../db/database";
import type { Role } from "./club-data";

export function ownerEmail(){
  return process.env.CLUB_OWNER_EMAIL?.trim().toLowerCase()??"";
}

export async function getRole(id:string):Promise<Role>{
  const role=await db().prepare(
    "SELECT CASE WHEN EXISTS (SELECT 1 FROM verified_accounts WHERE id=? AND email=?) THEN 'admin' ELSE COALESCE((SELECT role FROM club_roles WHERE user_id=?),'member') END AS role"
  ).bind(id,ownerEmail(),id).first<{role:Role}>();
  return role?.role??"member";
}
