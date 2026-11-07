import { createHmac, randomUUID } from "node:crypto";

const ALLOWED_ORIGINS = new Set([
  "https://the-choco-studios-official.vercel.app",
  "https://the-choco-studio-information.netlify.app",
  "https://tcs-information-hub.vercel.app",
  "https://choco-ai-independent-seven.vercel.app",
  "https://choco-ai-help-center.netlify.app",
  "https://tcs-admin-panel.vercel.app"
]);
const ALLOWED_SITES = new Set(["tcs-official","tcs-information","choco-ai","sara-ai-help-center"]);

function send(res,status,data,origin=""){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Vary","Origin");
  if(origin&&ALLOWED_ORIGINS.has(origin)){
    res.setHeader("Access-Control-Allow-Origin",origin);
    res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type");
  }
  if(status===204)return res.status(204).end();
  return res.status(status).json(data);
}
function header(req,name){const v=req.headers[name];return Array.isArray(v)?v[0]:String(v||"");}
async function readBody(req){
  if(req.body&&typeof req.body==="object")return req.body;
  if(typeof req.body==="string"){try{return JSON.parse(req.body);}catch{return null;}}
  return await new Promise(resolve=>{let raw="";req.on("data",chunk=>{raw+=chunk;if(raw.length>1800000){resolve(null);req.destroy();}});req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{});}catch{resolve(null);}});req.on("error",()=>resolve(null));});
}
const clean=(v,max)=>typeof v==="string"?v.trim().slice(0,max):"";
const hash=(v,key)=>createHmac("sha256",key).update(String(v)).digest("hex");
function classify(ua){
  const rules=[
    ["Googlebot",/googlebot|google-inspectiontool/i],["Bingbot",/bingbot/i],["Applebot",/applebot/i],
    ["GPTBot",/gptbot|chatgpt-user/i],["ClaudeBot",/claudebot|claude-web/i],["PerplexityBot",/perplexitybot/i],
    ["Facebook crawler",/facebookexternalhit|meta-externalagent/i],["Twitterbot",/twitterbot/i],
    ["LinkedInBot",/linkedinbot/i],["Discordbot",/discordbot/i],["AhrefsBot",/ahrefsbot/i],
    ["SemrushBot",/semrushbot/i],["DuckDuckBot",/duckduckbot/i],["YandexBot",/yandexbot/i],
    ["Baiduspider",/baiduspider/i],["Automated client",/curl\/|wget\/|python-requests|node-fetch|headlesschrome|puppeteer|playwright/i],
    ["Unidentified bot",/\b(bot|crawler|spider|scraper|preview)\b/i]
  ];
  for(const [name,pattern] of rules)if(pattern.test(ua))return{bot:true,name};
  return{bot:false,name:null};
}
function safePath(value){try{const u=new URL(String(value||"/"),"https://local.invalid");return(u.pathname||"/").slice(0,1000);}catch{return"/";}}
async function db(base,key,path,method,payload,prefer){
  const headers={apikey:key,Authorization:"Bearer "+key,Accept:"application/json","Content-Type":"application/json"};
  if(prefer)headers.Prefer=prefer;
  const r=await fetch(base+"/rest/v1/"+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:"no-store",signal:AbortSignal.timeout(12000)});
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw new Error("database_error");
  return data;
}
async function consumeLimit(base,key,rateKey,max,windowSeconds){
  const r=await fetch(base+"/rest/v1/rpc/tcs_consume_analytics_rate_limit",{
    method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({p_key:rateKey,p_limit:max,p_window_seconds:windowSeconds}),cache:"no-store",signal:AbortSignal.timeout(5000)
  });
  return r.ok&&await r.json()===true;
}
async function handleTrack(input,req,res,origin,base,key){
  const visitorId=clean(input.visitorId,36),sessionId=clean(input.sessionId,36);
  if(!/^[a-f0-9-]{32,36}$/i.test(visitorId)||!/^[a-f0-9-]{32,36}$/i.test(sessionId))return send(res,400,{ok:false,error:"invalid_input"},origin);
  const visitorHash=hash(visitorId,key),sessionHash=hash(sessionId,key);
  const ip=String(header(req,"x-vercel-forwarded-for")||header(req,"x-forwarded-for")).split(",").pop().trim();
  const ipHash=ip?hash(ip,key):visitorHash;
  if(!await consumeLimit(base,key,hash("analytics-ip:"+ipHash,key),600,3600)||
     !await consumeLimit(base,key,hash("analytics-visitor:"+visitorHash,key),180,3600))
    return send(res,429,{ok:false,error:"rate_limited"},origin);
  const siteKey=clean(input.siteKey,80).toLowerCase();
  if(!ALLOWED_SITES.has(siteKey))return send(res,400,{ok:false,error:"invalid_site"},origin);
  const ua=header(req,"user-agent").slice(0,600),bot=classify(ua);
  const common={
    site_key:siteKey,visitor_hash:visitorHash,session_hash:sessionHash,user_agent:ua||null,
    is_bot:bot.bot,bot_name:bot.name,
    country_code:header(req,"x-vercel-ip-country").slice(0,8)||null,
    region_code:header(req,"x-vercel-ip-country-region").slice(0,80)||null
  };
  if(input.event==="visit"){
    let referrerHost=null;try{referrerHost=input.referrer?new URL(String(input.referrer)).hostname.slice(0,255):null;}catch{}
    await db(base,key,"tcs_site_visits","POST",[{...common,page_path:safePath(input.path),referrer_host:referrerHost}],"return=minimal");
    return send(res,200,{ok:true},origin);
  }
  if(input.event==="download"){
    const productCode=clean(input.productCode,100),productName=clean(input.productName,180),url=clean(input.url,2000);
    if(!/^[a-z0-9][a-z0-9_-]{1,99}$/i.test(productCode)||productName.length<2||!/^https:\/\//i.test(url))return send(res,400,{ok:false,error:"invalid_input"},origin);
    const name=clean(input.name,120)||null,email=clean(input.email,254).toLowerCase()||null;
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send(res,400,{ok:false,error:"invalid_email"},origin);
    const parsed=new URL(url),safeUrl=parsed.origin+parsed.pathname;
    await db(base,key,"tcs_product_downloads","POST",[{
      ...common,product_code:productCode,product_name:productName,
      product_version:clean(input.version,60)||null,download_url:safeUrl,
      downloader_name:name,downloader_email:email
    }],"return=minimal");
    return send(res,200,{ok:true},origin);
  }
  return send(res,400,{ok:false,error:"invalid_event"},origin);
}
async function uploadLogo(base,key,dataUrl){
  if(!dataUrl)return null;
  const match=dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw new Error("invalid_logo");
  const bytes=Buffer.from(match[2],"base64");
  if(!bytes.length||bytes.length>1024*1024)throw new Error("logo_too_large");
  const mime=match[1],extension=mime==="image/jpeg"?"jpg":mime.slice(6),path=randomUUID()+"."+extension,bucket="tcs-brand-logos";
  const check=await fetch(base+"/storage/v1/bucket/"+bucket,{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
  if(check.status===404){
    const create=await fetch(base+"/storage/v1/bucket",{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({id:bucket,name:bucket,public:true,file_size_limit:1048576,allowed_mime_types:["image/png","image/jpeg","image/webp"]}),cache:"no-store"});
    if(!create.ok&&create.status!==409)throw new Error("logo_storage_unavailable");
  }else if(!check.ok)throw new Error("logo_storage_unavailable");
  const upload=await fetch(base+"/storage/v1/object/"+bucket+"/"+path,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":mime,"x-upsert":"false"},body:bytes,cache:"no-store",signal:AbortSignal.timeout(12000)});
  if(!upload.ok)throw new Error("logo_upload_failed");
  return base+"/storage/v1/object/public/"+bucket+"/"+path;
}
async function handleBrandApplication(input,req,res,origin,base,key){
  const brand_name=clean(input.brandName,120),slogan=clean(input.slogan,240),about=clean(input.about,5000),
    direction=clean(input.direction,3000),owner_name=clean(input.ownerName,120),contact_email=clean(input.email,254).toLowerCase();
  const website=clean(input.websiteUrl,500),repository=clean(input.repositoryUrl,500),relationship_type=clean(input.relationshipType,30);
  const domains=Array.isArray(input.domains)?input.domains.slice(0,20).map(x=>clean(x,253).toLowerCase()).filter(Boolean):[];
  const safeHttps=value=>{if(!value)return null;try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)throw new Error();return u.toString().slice(0,500);}catch{throw new Error("invalid_input");}};
  const safeDomains=domains.map(domain=>{if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw new Error("invalid_input");return domain;});
  if(!["under_tcs","partner"].includes(relationship_type)||brand_name.length<2||slogan.length<3||about.length<20||direction.length<10||owner_name.length<2||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)||!contact_email.endsWith("@gmail.com"))
    return send(res,400,{ok:false,error:"invalid_input"},origin);
  const ip=String(header(req,"x-vercel-forwarded-for")||header(req,"x-forwarded-for")).split(",").pop().trim();
  const rateKey=hash("brand-application:"+contact_email+":"+(ip||"unknown"),key);
  if(!await consumeLimit(base,key,rateKey,3,86400))return send(res,429,{ok:false,error:"rate_limited"},origin);
  const logo_url=await uploadLogo(base,key,clean(input.logoDataUrl,1500000));
  await db(base,key,"tcs_brand_applications","POST",[{
    brand_name,logo_url,slogan,about,direction,owner_name,contact_email,relationship_type,
    website_url:safeHttps(website),repository_url:safeHttps(repository),known_domains:safeDomains
  }],"return=minimal");
  return send(res,201,{ok:true},origin);
}

export async function handleTcsPublic(req,res){
  const origin=header(req,"origin");
  if(req.method==="OPTIONS")return send(res,204,{},origin);
  if(req.method!=="POST")return send(res,405,{ok:false,error:"method_not_allowed"},origin);
  if(origin&&!ALLOWED_ORIGINS.has(origin))return send(res,403,{ok:false,error:"origin_not_allowed"},origin);
  try{
    const input=await readBody(req);
    if(!input||typeof input!=="object"||Array.isArray(input))return send(res,400,{ok:false,error:"invalid_json"},origin);
    const key=process.env.SUPABASE_SECRET_KEY||"",base=String(process.env.TCS_SUPABASE_URL||"").replace(/\/+$/,"");
    if(!key||!base)return send(res,503,{ok:false,error:"service_unavailable"},origin);
    if(input.action==="track")return await handleTrack(input,req,res,origin,base,key);
    if(input.action==="brand_application")return await handleBrandApplication(input,req,res,origin,base,key);
    return send(res,400,{ok:false,error:"unknown_action"},origin);
  }catch(error){
    const code=String(error?.message||"");
    const status=code==="invalid_logo"||code==="logo_too_large"||code==="invalid_input"?400:500;
    return send(res,status,{ok:false,error:status===400?code:"public_request_failed"},origin);
  }
}
