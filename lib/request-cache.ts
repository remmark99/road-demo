import { createClient } from './supabase/client'

/** Short-lived browser-only cache, isolated by authenticated session and request parameters. */
export function createRequestCache() {
 const entries=new Map<string,{until:number; value:Promise<unknown>}>()
 return async function cached<T>(scope:string,key:string,ttl:number,read:()=>Promise<T>):Promise<T> {
  const id=JSON.stringify([scope,key]),now=Date.now(),existing=entries.get(id)
  if(existing && existing.until>now)return existing.value as Promise<T>
  for(const [k,e] of entries)if(e.until<=now)entries.delete(k)
  if(entries.size>=50)entries.delete(entries.keys().next().value!)
  const entry={until:Infinity,value:Promise.resolve().then(read)}
  entries.set(id,entry)
  try {const value=await entry.value;entry.until=Date.now()+ttl;return value}
  catch(error){if(entries.get(id)===entry)entries.delete(id);throw error}
 }
}
const cached=createRequestCache()
export async function sessionRequest<T>(key:string,ttl:number,read:()=>Promise<T>):Promise<T> {
 if(typeof window==='undefined')return read()
 const {data:{session}}=await createClient().auth.getSession()
 if(!session)return read()
 return cached(session.access_token,key,ttl,read)
}
