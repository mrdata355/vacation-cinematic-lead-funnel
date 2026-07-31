const crypto=require('crypto');
const NOTIFY_EMAIL='mrdata0501@gmail.com';
const CONSENT_VERSION='2026-07-31-v2';
const CONTACT_TEXT='Manual live telephone call and email authorized for the requested promotional vacation opportunity. Callback may include a sales offer. Consent is not a condition of purchase. No charge or reservation is created.';
const CALLBACK_TEXT='Customer selected a callback window and stated they expect to be available and intend to answer or return the call.';
const SALES_TEXT='Customer understands this is a promotional sales callback request. No travel is reserved and no payment card is requested, stored, authorized, or charged through this website.';
const PRIVACY_TEXT='Customer reviewed the Privacy Policy and Terms before submitting.';
const FIELDS=['destination','travel_window','age_18_plus','employment','relationship','first_name','last_name','email','phone','callback_date','callback_time','presentation_ack','contact_consent','callback_commitment','sales_ack','privacy_ack','utm_source','utm_campaign','utm_medium','browser_timezone','page_url','completed_in_ms'];
function clean(v,max=500){return String(v??'').trim().slice(0,max)}
function reply(res,status,body){res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body))}
module.exports=async function handler(req,res){
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
 if(Number(req.headers['content-length']||0)>25000)return reply(res,413,{error:'Request too large'});
 const body=req.body&&typeof req.body==='object'?req.body:{};
 if(body.website)return reply(res,200,{ok:true});
 if(Number(body.completed_in_ms||0)<5000)return reply(res,400,{error:'Please complete the form before submitting.'});
 const required=['destination','travel_window','age_18_plus','employment','relationship','first_name','last_name','email','phone','callback_date','callback_time','presentation_ack','contact_consent','callback_commitment','sales_ack','privacy_ack'];
 for(const key of required){if(!clean(body[key]))return reply(res,400,{error:'Please complete every required field.'})}
 if(body.age_18_plus!=='Yes'||body.employment==='Full-time student')return reply(res,400,{error:'This promotion is not available for this eligibility route.'});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email,180)))return reply(res,400,{error:'Enter a valid email address.'});
 if(clean(body.phone,40).replace(/\D/g,'').length<10)return reply(res,400,{error:'Enter a valid mobile number.'});
 const lead={lead_id:crypto.randomUUID(),submitted_at:new Date().toISOString(),consent_version:CONSENT_VERSION,contact_consent_record:CONTACT_TEXT,callback_commitment_record:CALLBACK_TEXT,sales_disclosure_record:SALES_TEXT,privacy_record:PRIVACY_TEXT,user_agent:clean(req.headers['user-agent'])};
 for(const key of FIELDS)lead[key]=clean(body[key],key==='page_url'?900:500);
 lead.ip_hash=crypto.createHash('sha256').update(clean(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown',200)+(process.env.LEAD_HASH_SALT||'vacation-preview')).digest('hex').slice(0,24);
 const form=new URLSearchParams();
 for(const [key,value] of Object.entries(lead))form.set(key,value);
 form.set('_subject',`Vacation callback lead: ${lead.first_name} ${lead.last_name} · ${lead.destination}`);
 form.set('_template','table');
 form.set('_replyto',lead.email);
 form.set('_url',lead.page_url||'https://vacation-cinematic-lead-funnel.vercel.app/');
 form.set('_captcha','false');
 try{
  const response=await fetch(`https://formsubmit.co/${NOTIFY_EMAIL}`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'text/html,application/json','origin':'https://vacation-cinematic-lead-funnel.vercel.app','referer':lead.page_url||'https://vacation-cinematic-lead-funnel.vercel.app/','user-agent':'Mozilla/5.0 VacationPreviewAccess/2.1'},body:form.toString(),redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(response.status>=200&&response.status<400)return reply(res,200,{ok:true,lead_id:lead.lead_id});
  const detail=clean(await response.text().catch(()=>''),240);
  console.error('FormSubmit delivery rejected',response.status,detail);
  return reply(res,502,{error:'We could not deliver your request. Please call (813) 524-8915 so your request is not lost.'});
 }catch(error){console.error('FormSubmit delivery failed',error);return reply(res,502,{error:'We could not deliver your request. Please call (813) 524-8915 so your request is not lost.'})}
};