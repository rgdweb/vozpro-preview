module.exports=[93695,(e,t,a)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},70406,(e,t,a)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},18622,(e,t,a)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},24725,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},14747,(e,t,a)=>{t.exports=e.x("path",()=>require("path"))},46786,(e,t,a)=>{t.exports=e.x("os",()=>require("os"))},24868,(e,t,a)=>{t.exports=e.x("fs/promises",()=>require("fs/promises"))},72829,e=>{"use strict";var t=e.i(24868),a=e.i(14747),r=e.i(46786);let o=async()=>{let e=r.default.homedir();for(let r of[a.default.join(process.cwd(),".z-ai-config"),a.default.join(e,".z-ai-config"),"/etc/.z-ai-config"])try{let e=await t.default.readFile(r,"utf-8"),a=JSON.parse(e);if(a.baseUrl&&a.apiKey)return a}catch(e){"ENOENT"!==e.code&&console.error(`Error reading or parsing config file at ${r}:`,e)}throw Error("Configuration file not found or invalid. Please create .z-ai-config in your project, home directory, or /etc.")};class i{constructor(e){this.config=e,this.chat={completions:{create:this.createChatCompletion.bind(this),createVision:this.createChatCompletionVision.bind(this)}},this.audio={tts:{create:this.createAudioTTS.bind(this)},asr:{create:this.createAudioASR.bind(this)}},this.images={generations:{create:this.createImageGeneration.bind(this),edit:this.createImageEdit.bind(this)}},this.video={generations:{create:this.createVideoGeneration.bind(this)}},this.async={result:{query:this.queryAsyncResult.bind(this)}},this.functions={invoke:this.invokeFunction.bind(this)}}static async create(){return new i(await o())}async createChatCompletion(e){let{baseUrl:t,chatId:a,userId:r,apiKey:o,token:i}=this.config,n=`${t}/chat/completions`,s={"Content-Type":"application/json",Authorization:`Bearer ${o}`,"X-Z-AI-From":"Z"};a&&(s["X-Chat-Id"]=a),r&&(s["X-User-Id"]=r),i&&(s["X-Token"]=i);let c={...e,thinking:e.thinking||{type:"disabled"}};try{let e=await fetch(n,{method:"POST",headers:s,body:JSON.stringify(c)});if(!e.ok){let t=await e.text();throw Error(`API request failed with status ${e.status}: ${t}`)}let t=e.headers.get("content-type")||"";if(c.stream&&(t.includes("text/event-stream")||t.includes("text/plain")))return e.body;return await e.json()}catch(e){throw console.error("Failed to make API request:",e),e}}async createChatCompletionVision(e){let{baseUrl:t,chatId:a,userId:r,apiKey:o,token:i}=this.config,n=`${t}/chat/completions/vision`,s={"Content-Type":"application/json",Authorization:`Bearer ${o}`,"X-Z-AI-From":"Z"};a&&(s["X-Chat-Id"]=a),r&&(s["X-User-Id"]=r),i&&(s["X-Token"]=i);let c={...e,thinking:e.thinking||{type:"disabled"}};try{let e=await fetch(n,{method:"POST",headers:s,body:JSON.stringify(c)});if(!e.ok){let t=await e.text();throw Error(`API request failed with status ${e.status}: ${t}`)}let t=e.headers.get("content-type")||"";if(c.stream&&(t.includes("text/event-stream")||t.includes("text/plain")))return e.body;return await e.json()}catch(e){throw console.error("Failed to make vision API request:",e),e}}async createAudioTTS(e){let{baseUrl:t,chatId:a,userId:r,apiKey:o,token:i}=this.config,n=`${t}/audio/tts`,s={"Content-Type":"application/json",Authorization:`Bearer ${o}`,"X-Z-AI-From":"Z"};a&&(s["X-Chat-Id"]=a),r&&(s["X-User-Id"]=r),i&&(s["X-Token"]=i);try{let t=await fetch(n,{method:"POST",headers:s,body:JSON.stringify(e)});if(!t.ok){let e=await t.text();throw Error(`API request failed with status ${t.status}: ${e}`)}return t}catch(e){throw console.error("Failed to make TTS API request:",e),e}}async createAudioASR(e){let{baseUrl:t,chatId:a,userId:r,apiKey:o,token:i}=this.config,n=`${t}/audio/asr`,s={"Content-Type":"application/json",Authorization:`Bearer ${o}`,"X-Z-AI-From":"Z"};a&&(s["X-Chat-Id"]=a),r&&(s["X-User-Id"]=r),i&&(s["X-Token"]=i);try{let t=await fetch(n,{method:"POST",headers:s,body:JSON.stringify(e)});if(!t.ok){let e=await t.text();throw Error(`API request failed with status ${t.status}: ${e}`)}return await t.json()}catch(e){throw console.error("Failed to make ASR API request:",e),e}}async createImageGeneration(e){let{baseUrl:t,apiKey:a,chatId:r,userId:o,token:i}=this.config,n=`${t}/images/generations`,s={"Content-Type":"application/json",Authorization:`Bearer ${a}`,"X-Z-AI-From":"Z"};r&&(s["X-Chat-Id"]=r),o&&(s["X-User-Id"]=o),i&&(s["X-Token"]=i);let c={...e};try{let e=await fetch(n,{method:"POST",headers:s,body:JSON.stringify(c)});if(!e.ok){let t=await e.text();throw Error(`API request failed with status ${e.status}: ${t}`)}let t=await e.json(),a=await Promise.all(t.data.map(async e=>e.url?{base64:await this.downloadImageAsBase64(e.url),format:"png"}:e));return{...t,data:a}}catch(e){throw console.error("Failed to make image generation request:",e),e}}async createImageEdit(e){let{baseUrl:t,apiKey:a,chatId:r,userId:o,token:i}=this.config,n=`${t}/images/generations/edit`,s={"Content-Type":"application/json",Authorization:`Bearer ${a}`,"X-Z-AI-From":"Z"};r&&(s["X-Chat-Id"]=r),o&&(s["X-User-Id"]=o),i&&(s["X-Token"]=i);let c={...e};try{let e=await fetch(n,{method:"POST",headers:s,body:JSON.stringify(c)});if(!e.ok){let t=await e.text();throw Error(`API request failed with status ${e.status}: ${t}`)}let t=await e.json(),a=await Promise.all(t.data.map(async e=>e.url?{base64:await this.downloadImageAsBase64(e.url),format:"png"}:e));return{...t,data:a}}catch(e){throw console.error("Failed to make image edit request:",e),e}}async downloadImageAsBase64(e){try{let t=await fetch(e);if(!t.ok)throw Error(`Failed to download image: ${t.status}`);let a=await t.arrayBuffer(),r=Buffer.from(a).toString("base64");return`${r}`}catch(e){throw console.error("Failed to download and convert image to base64:",e),e}}async createVideoGeneration(e){let{baseUrl:t,apiKey:a,chatId:r,userId:o,token:i}=this.config,n=`${t}/video/generation`,s={"Content-Type":"application/json",Authorization:`Bearer ${a}`,"X-Z-AI-From":"Z"};r&&(s["X-Chat-Id"]=r),o&&(s["X-User-Id"]=o),i&&(s["X-Token"]=i);try{let t=await fetch(n,{method:"POST",headers:s,body:JSON.stringify(e)});if(!t.ok){let e=await t.text();throw Error(`API request failed with status ${t.status}: ${e}`)}return await t.json()}catch(e){throw console.error("Failed to make video generation request:",e),e}}async queryAsyncResult(e){let{baseUrl:t,apiKey:a,chatId:r,userId:o,token:i}=this.config,n=`${t}/async-result?id=${encodeURIComponent(e)}`,s={Authorization:`Bearer ${a}`,"X-Z-AI-From":"Z"};r&&(s["X-Chat-Id"]=r),o&&(s["X-User-Id"]=o),i&&(s["X-Token"]=i);try{let e=await fetch(n,{method:"GET",headers:s});if(!e.ok){let t=await e.text();throw Error(`API request failed with status ${e.status}: ${t}`)}return await e.json()}catch(e){throw console.error("Failed to query async result:",e),e}}async invokeFunction(e,t){let{baseUrl:a,apiKey:r,chatId:o,userId:i,token:n}=this.config,s=`${a}/functions/invoke`,c={"Content-Type":"application/json",Authorization:`Bearer ${r}`,"X-Z-AI-From":"Z"};o&&(c["X-Chat-Id"]=o),i&&(c["X-User-Id"]=i),n&&(c["X-Token"]=n);try{let a=await fetch(s,{method:"POST",headers:c,body:JSON.stringify({function_name:e,arguments:t})});if(!a.ok){let e=await a.text();throw Error(`Function invoke failed with status ${a.status}: ${e}`)}return(await a.json()).result}catch(e){throw console.error("Failed to invoke remote function:",e),e}}}e.s(["default",0,i])},81647,e=>{"use strict";var t=e.i(4329),a=e.i(92566),r=e.i(58166),o=e.i(98359),i=e.i(30901),n=e.i(65577),s=e.i(90631),c=e.i(75542),l=e.i(41135),d=e.i(86650),u=e.i(57680),p=e.i(36005),h=e.i(75802),x=e.i(64422),m=e.i(3477),f=e.i(93695);e.i(92918);var g=e.i(65338),w=e.i(9453),y=e.i(72829);let v=null;async function A(){return v||(v=await y.default.create()),v}let R=`Voc\xea \xe9 um agente especialista em otimiza\xe7\xe3o de pron\xfancia para TTS (text-to-speech) em portugu\xeas brasileiro.

Seu trabalho: analisar o texto e corrigir APENAS as palavras que o TTS pode pronunciar errado, usando colchetes [pron\xfancia correta].

## REGRAS OBRIGAT\xd3RIAS:

1. **Artigos no in\xedcio de frase ap\xf3s ponto final**: O TTS confunde "O" e "A" artigos com a letra. SEMPRE coloque em min\xfasculo entre colchetes.
   - ". O sistema" → ". [o] sistema"
   - ". A casa" → ". [a] casa"  
   - ". Os resultados" → ". [os] resultados"
   - ". As coisas" → ". [as] coisas"
   - ". Um homem" → ". [um] homem"
   - ". Uma mulher" → ". [uma] mulher"

2. **N\xfameros soltos ou em contextos espec\xedficos**: Escreva por extenso entre colchetes.
   - "dia 15" → "dia [quinze]"
   - "\xe0s 14h" → "\xe0s [quatorze] horas"
   - "cap\xedtulo 3" → "cap\xedtulo [tr\xeas]"
   - "ano 2024" → "ano [dois mil vinte e quatro]"

3. **Valores monet\xe1rios**: Escreva por extenso entre colchetes.
   - "R$ 50" → "[cinquenta reais]"
   - "R$ 1.599,90" → "[mil quinhentos e noventa e nove reais e noventa centavos]"
   - "$ 100" → "[cem d\xf3lares]"
   - "€ 200" → "[duzentos euros]"
   - "\xa3 50" → "[cinquenta libras]"

4. **URLs e e-mails**: Escreva letra por letra entre colchetes.
   - "www.site.com.br" → "[w w w ponto site ponto com ponto br]"
   - "contato@email.com" → "[contato arroba email ponto com]"

5. **Abrevia\xe7\xf5es e siglas**: Expanda ou soletra entre colchetes.
   - "Sr." → "[Senhor]", "Sra." → "[Senhora]"
   - "Dr." → "[Doutor]", "Dra." → "[Doutora]"
   - "Av." → "[Avenida]", "Prof." → "[Professor]"
   - "Gov." → "[Governador]"
   - Siglas comuns: CNPJ → [c\xea ene p\xea jota], CPF → [c\xea p\xea \xe9fe]

6. **Hor\xe1rios e datas**:
   - "14h" → "[quatorze] horas"
   - "08:30" → "[oito horas e trinta]"
   - "15/03/2024" → "[quinze de mar\xe7o de dois mil vinte e quatro]"

7. **Porcentagens**:
   - "50%" → "[cinquenta por cento]"

8. **Estrangeirismos e termos em ingl\xeas**: Pron\xfancia aportuguesada.
   - "marketing" → "[marqueting]"
   - "download" → "[daunloud]"
   - "software" → "[softeu\xe9r]"
   - "startup" → "[startape]"
   - "delivery" → "[deliv\xe9ri]"
   - "fitness" → "[fitnes]"
   - "gaming" → "[g\xeaimingue]"

9. **H mudo**: Remova o H da pron\xfancia.
   - "homem" → "[omem]", "hoje" → "[oje]", "hora" → "[ora]"
   - "hist\xf3ria" → "[ist\xf3ria]", "hernia" → "[\xe9rnia]"
   - "hidr\xe1ulico" → "[idr\xe1ulico]", "heran\xe7a" → "[eran\xe7a]"
   - "harmonia" → "[armonia]", "honestidade" → "[onestidade]"

10. **Consoantes mudas**: Corrija a pron\xfancia.
    - "pneu" → "[peneu]", "psic\xf3logo" → "[psic\xf3logo]"
    - "gnomo" → "[nomo]", "mnem\xf4nico" → "[nem\xf4nico]"

11. **Letra X com sons diferentes**: Corrija conforme o som correto.
    - X=CH: "xarope" → "[charope]", "peixe" → "[peiche]", "baixo" → "[baicho]"
    - X=Z: "exemplo" → "[ezemplo]", "ex\xe9rcito" → "[ez\xe9rcito]"
    - X=KS: "t\xe1xi" → "[t\xe1csi]", "complexo" → "[complekso]"
    - X=SS: "M\xe9xico" → "[M\xe9ssico]"

12. **Marcas e nomes pr\xf3prios internacionais**: Pron\xfancia aportuguesada.
    - "Apple" → "[\xc9pel]", "Microsoft" → "[Maicr\xf3softe]"
    - "Volkswagen" → "[Folquesv\xe1gue]", "Hyundai" → "[Rundai]"
    - "Philips" → "[Philips]", "Docker" → "[D\xf3quer]"

13. **Termos m\xe9dicos e medicamentos**: Pron\xfancia correta em PT-BR.
    - "ibuprofeno" → "[ibuprofeno]", "dipirona" → "[dipirona]"
    - "omeprazol" → "[omeprazol]", "amoxicilina" → "[amoxicilina]"
    - "trombose" → "[trombose]", "anafilaxia" → "[anafilaxia]"

14. **Siglas governamentais e tributos**:
    - "STF" → "[\xe9s t\xea \xe9fe]", "TJ" → "[t\xea jota]"
    - "INSS" → "[i \xe9ne esse esse]", "FGTS" → "[\xe9fe g\xea t\xea esse]"
    - "ICMS" → "[i c\xea \xe9me esse]", "IPVA" → "[i p\xea v\xea \xe1]"

## REGRAS DE N\xc3O INTERFER\xcaNCIA:

- N\xc3O altere palavras que j\xe1 est\xe3o entre colchetes [ ] (j\xe1 foram processadas)
- N\xc3O adicione v\xedrgulas ou pontua\xe7\xe3o que n\xe3o existia
- N\xc3O altere a estrutura das frases
- N\xc3O traduza palavras — apenas corrija pron\xfancia
- N\xc3O coloque colchetes em palavras normais do texto
- N\xc3O resuma ou encurte o texto de NENHUMA forma
- Mantenha TODOS os pontos finais, v\xedrgulas, exclama\xe7\xf5es e interroga\xe7\xf5es EXATAMENTE onde est\xe3o

## FORMATO DE SA\xcdDA:

Responda APENAS com o texto corrigido. Nenhuma explica\xe7\xe3o, nenhum coment\xe1rio, nenhum prefixo.
Se n\xe3o houver nada para corrigir, retorne o texto exatamente como veio.
O texto deve ser id\xeantico ao original, com EXCE\xc7\xc3O das corre\xe7\xf5es entre colchetes.`;async function E(e){try{let{text:t}=await e.json();if(!t||"string"!=typeof t||0===t.trim().length)return w.NextResponse.json({error:"Texto vazio"},{status:400});let a=t.trim();if(a.length<5)return w.NextResponse.json({optimized:a,changed:!1,changes:0});let r=/\.\s+[OoAaUu]\s+[a-záàãâéèêíïóôõúüç]/.test(a),o=/\d/.test(a),i=/www\.|https?:\/\/|\.com|\.br/.test(a),n=/\S+@\S+\.\S+/.test(a),s=/\b(Sr|Sra|Dr|Dra|Prof|Gov|Av|Rua)\.\s/i.test(a),c=/\d+%/.test(a),l=/R\$\s*\d|\$\s*\d/.test(a);if(!(r||o||i||n||s||c||l))return w.NextResponse.json({optimized:a,changed:!1,changes:0});console.log("[Pronunciation Agent] Analisando texto ("+a.length+" chars)...");let d=await A(),u=await d.chat.completions.create({messages:[{role:"system",content:R},{role:"user",content:a}],temperature:.1}),p=u.choices[0]?.message?.content?.trim();if(!p)return console.log("[Pronunciation Agent] LLM retornou vazio, usando original"),w.NextResponse.json({optimized:a,changed:!1,changes:0});let h=p.match(/\[[^\]]+\]/g),x=h?h.length:0,m=x>0;return console.log("[Pronunciation Agent] Resultado:",m?`${x} corre\xe7\xf5es`:"sem alterações"),w.NextResponse.json({optimized:p,changed:m,changes:x})}catch(a){console.error("[Pronunciation Agent] Erro:",a instanceof Error?a.message:String(a));let t=await e.json().catch(()=>({text:""}));return w.NextResponse.json({optimized:t.text?.trim()||"",changed:!1,changes:0,error:a instanceof Error?a.message:"Erro desconhecido"})}}e.s(["POST",()=>E],39369);var S=e.i(39369);let T=new t.AppRouteRouteModule({definition:{kind:a.RouteKind.APP_ROUTE,page:"/api/optimize-pronunciation/route",pathname:"/api/optimize-pronunciation",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/omnivoice-build/omnivoice-src/src/app/api/optimize-pronunciation/route.ts",nextConfigOutput:"standalone",userland:S}),{workAsyncStorage:C,workUnitAsyncStorage:b,serverHooks:I}=T;function P(){return(0,r.patchFetch)({workAsyncStorage:C,workUnitAsyncStorage:b})}async function k(e,t,r){T.isDev&&(0,o.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let w="/api/optimize-pronunciation/route";w=w.replace(/\/index$/,"")||"/";let y=await T.prepare(e,t,{srcPage:w,multiZoneDraftMode:!1});if(!y)return t.statusCode=400,t.end("Bad Request"),null==r.waitUntil||r.waitUntil.call(r,Promise.resolve()),null;let{buildId:v,params:A,nextConfig:R,parsedUrl:E,isDraftMode:S,prerenderManifest:C,routerServerContext:b,isOnDemandRevalidate:I,revalidateOnlyGenerated:P,resolvedPathname:k,clientReferenceManifest:q,serverActionsManifest:O}=y,N=(0,s.normalizeAppPath)(w),$=!!(C.dynamicRoutes[N]||C.routes[k]),j=async()=>((null==b?void 0:b.render404)?await b.render404(e,t,E,!1):t.end("This page could not be found"),null);if($&&!S){let e=!!C.routes[k],t=C.dynamicRoutes[N];if(t&&!1===t.fallback&&!e){if(R.experimental.adapterPath)return await j();throw new f.NoFallbackError}}let X=null;!$||T.isDev||S||(X="/index"===(X=k)?"/":X);let F=!0===T.isDev||!$,z=$&&!F;O&&q&&(0,n.setManifestsSingleton)({page:w,clientReferenceManifest:q,serverActionsManifest:O});let U=e.method||"GET",D=(0,i.getTracer)(),M=D.getActiveScopeSpan(),H={params:A,prerenderManifest:C,renderOpts:{experimental:{authInterrupts:!!R.experimental.authInterrupts},cacheComponents:!!R.cacheComponents,supportsDynamicResponse:F,incrementalCache:(0,o.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:R.cacheLife,waitUntil:r.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,a,r,o)=>T.onRequestError(e,t,r,o,b)},sharedContext:{buildId:v}},B=new c.NodeNextRequest(e),Z=new c.NodeNextResponse(t),_=l.NextRequestAdapter.fromNodeNextRequest(B,(0,l.signalFromNodeResponse)(t));try{let n=async e=>T.handle(_,H).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let a=D.getRootSpanAttributes();if(!a)return;if(a.get("next.span_type")!==d.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${a.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let r=a.get("next.route");if(r){let t=`${U} ${r}`;e.setAttributes({"next.route":r,"http.route":r,"next.span_name":t}),e.updateName(t)}else e.updateName(`${U} ${w}`)}),s=!!(0,o.getRequestMeta)(e,"minimalMode"),c=async o=>{var i,c;let l=async({previousCacheEntry:a})=>{try{if(!s&&I&&P&&!a)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await n(o);e.fetchMetrics=H.renderOpts.fetchMetrics;let c=H.renderOpts.pendingWaitUntil;c&&r.waitUntil&&(r.waitUntil(c),c=void 0);let l=H.renderOpts.collectedTags;if(!$)return await (0,p.sendResponse)(B,Z,i,H.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,h.toNodeOutgoingHttpHeaders)(i.headers);l&&(t[m.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let a=void 0!==H.renderOpts.collectedRevalidate&&!(H.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&H.renderOpts.collectedRevalidate,r=void 0===H.renderOpts.collectedExpire||H.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:H.renderOpts.collectedExpire;return{value:{kind:g.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:a,expire:r}}}}catch(t){throw(null==a?void 0:a.isStale)&&await T.onRequestError(e,t,{routerKind:"App Router",routePath:w,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:z,isOnDemandRevalidate:I})},!1,b),t}},d=await T.handleResponse({req:e,nextConfig:R,cacheKey:X,routeKind:a.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:C,isRoutePPREnabled:!1,isOnDemandRevalidate:I,revalidateOnlyGenerated:P,responseGenerator:l,waitUntil:r.waitUntil,isMinimalMode:s});if(!$)return null;if((null==d||null==(i=d.value)?void 0:i.kind)!==g.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(c=d.value)?void 0:c.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",I?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),S&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let f=(0,h.fromNodeOutgoingHttpHeaders)(d.value.headers);return s&&$||f.delete(m.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||f.get("Cache-Control")||f.set("Cache-Control",(0,x.getCacheControlHeader)(d.cacheControl)),await (0,p.sendResponse)(B,Z,new Response(d.value.body,{headers:f,status:d.value.status||200})),null};M?await c(M):await D.withPropagatedContext(e.headers,()=>D.trace(d.BaseServerSpan.handleRequest,{spanName:`${U} ${w}`,kind:i.SpanKind.SERVER,attributes:{"http.method":U,"http.target":e.url}},c))}catch(t){if(t instanceof f.NoFallbackError||await T.onRequestError(e,t,{routerKind:"App Router",routePath:N,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:z,isOnDemandRevalidate:I})},!1,b),$)throw t;return await (0,p.sendResponse)(B,Z,new Response(null,{status:500})),null}}e.s(["handler",()=>k,"patchFetch",()=>P,"routeModule",()=>T,"serverHooks",()=>I,"workAsyncStorage",()=>C,"workUnitAsyncStorage",()=>b],81647)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__93249311._.js.map