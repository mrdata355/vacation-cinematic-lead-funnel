const crypto=require('crypto');
const ALLOWED_FIELDS=['destination','travel_window','age_18_plus','employment','relationship','first_name','last_name','email','phone','callback_date','callback_time','presentation_ack','contact_consent','privacy_ack','utm_source','utm_campaign','utm_medium','browser_timezone','page_url','completed_in_ms'];
function clean(value,max=300){return String(value??'').trim().slice(0,max)}
function json(res,status,body){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body))}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const length=Number(req.headers['content-length']||0);if(length>25000)return json(res,413,{error:'Request too large'});
  const origin=clean(req.headers.origin,500);const allowedOrigin=clean(process.env.PUBLIC_SITE_URL,500);if(allowedOrigin&&origin&&origin!==allowedOrigin)return json(res,403,{error:'Origin not allowed'});
  const body=req.body&&typeof req.body==='object'?req.body:{};
  if(body.website)return json(res,200,{ok:true});
  if(Number(body.completed_in_ms||0)<5000)return json(res,400,{error:'Please complete the form before submitting.'});
  const required=['destination','travel_window','age_18_plus','employment','relationship','first_name','last_name','email','phone','callback_date','callback_time','presentation_ack','contact_consent','privacy_ack'];
  for(const key of required){if(!clean(body[key]))return json(res,400,{error:'Please complete every required field.'})}
  if(body.age_18_plus!=='Yes'||body.employment==='Full-time student')return json(res,400,{error:'This promotion is not available for this eligibility route.'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email,180)))return json(res,400,{error:'Enter a valid email address.'});
  if(clean(body.phone,40).replace(/\D/g,'').length<10)return json(res,400,{error:'Enter a valid mobile number.'});
  const lead={id:crypto.randomUUID(),submitted_at:new Date().toISOString()};for(const key of ALLOWED_FIELDS)lead[key]=clean(body[key],key==='page_url'?800:300);
  lead.ip_hash=crypto.createHash('sha256').update(clean(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown',200)+(process.env.LEAD_HASH_SALT||'vacation-preview')).digest('hex').slice(0,24);
  const webhook=process.env.LEAD_WEBHOOK_URL;
  const resendKey=process.env.RESEND_API_KEY;const notifyTo=process.env.LEAD_NOTIFY_TO;const notifyFrom=process.env.LEAD_NOTIFY_FROM;
  if(!webhook&&!(resendKey&&notifyTo&&notifyFrom))return json(res,503,{error:'Online requests are being connected. Please call (813) 524-8915 so your request is not lost.'});
  const deliveries=[];
  if(webhook){deliveries.push(fetch(webhook,{method:'POST',headers:{'content-type':'application/json','user-agent':'VacationPreviewAccess/1.0'},body:JSON.stringify(lead),signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw new Error('Webhook rejected lead')}))}
  if(resendKey&&notifyTo&&notifyFrom){const text=Object.entries(lead).filter(([k])=>!['ip_hash'].includes(k)).map(([k,v])=>`${k}: ${v}`).join('\n');deliveries.push(fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${resendKey}`,'content-type':'application/json'},body:JSON.stringify({from:notifyFrom,to:[notifyTo],subject:`Vacation lead: ${lead.first_name} ${lead.last_name} · ${lead.destination}`,text}),signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw new Error('Email delivery failed')}))}
  try{await Promise.any(deliveries);return json(res,200,{ok:true,lead_id:lead.id})}catch{return json(res,502,{error:'We could not deliver your request. Please call (813) 524-8915 so your request is not lost.'})}
};