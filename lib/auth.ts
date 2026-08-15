import { env } from "cloudflare:workers";
const COOKIE="stellar_session",encoder=new TextEncoder();
function config(){const e=env as unknown as Record<string,string>;return{user:e.SITE_AUTH_USER||"admin",password:e.SITE_AUTH_PASSWORD||"",secret:e.SITE_AUTH_SECRET||""}}
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
async function signature(payload:string){const key=await crypto.subtle.importKey("raw",encoder.encode(config().secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(payload))))}
export function credentialsReady(){const c=config();return Boolean(c.password&&c.secret)}
export function adminCredentials(user:string,password:string){const c=config();return credentialsReady()&&user===c.user&&password===c.password}
export async function hashPassword(password:string,salt=b64(crypto.getRandomValues(new Uint8Array(16)))){const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:encoder.encode(salt),iterations:120000},key,256);return{salt,hash:b64(new Uint8Array(bits))}}
export async function verifyPassword(password:string,salt:string,expected:string){return(await hashPassword(password,salt)).hash===expected}
export async function makeToken(user:string){const payload=`${user}.${Date.now()+90*24*60*60*1000}`;return`${payload}.${await signature(payload)}`}
export async function getSessionUser(request:Request){const raw=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);if(!raw)return null;const parts=raw.split(".");if(parts.length!==3||Number(parts[1])<Date.now())return null;const payload=`${parts[0]}.${parts[1]}`;return(await signature(payload))===parts[2]?parts[0]:null}
export async function validRequest(request:Request){return Boolean(await getSessionUser(request))}
export function adminUser(){return config().user}
export const sessionCookie=(token:string)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${90*24*60*60}`;
export const clearCookie=()=>`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
