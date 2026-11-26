'use strict';
// A convenience lock inside the already authenticated admin workspace.
// This is not a replacement for Convex authentication or server authorization.
const AccessCode={
  async matches(value){
    const pin=String(value).trim().replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776));
    if(!/^\d{4}$/.test(pin))return false;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pin));
    return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')==='fe675fe7aaee830b6fed09b64e034f84dcbdaeb429d9cccd4ebb90e15af8dd71';
  }
};
const AccessGuard=(()=>{
  let reportsUnlocked=false,pending=null;
  function request(title){
    if(pending)return pending;
    const opener=document.activeElement,dialog=document.createElement('dialog');dialog.className='inventory-dialog access-dialog';
    dialog.innerHTML=`<form><div class="modal-head"><span class="modal-symbol">${icon('lock-keyhole')}</span><button class="icon-button" type="button" data-cancel aria-label="إغلاق طلب الرمز">${icon('x')}</button></div><h2>اكتب رمز الدخول</h2><p class="modal-description">حتى تفتح ${escapeHtml(title)}، اكتب الرمز الخاص بالإدارة.</p><label class="field">رمز الدخول<input aria-label="رمز الدخول" type="password" inputmode="numeric" maxlength="4" pattern="[0-9٠-٩۰-۹]{4}" autocomplete="off" required dir="ltr"></label><p class="form-error" role="alert" hidden></p><div class="modal-actions"><button class="primary-button" type="submit">فتح</button><button class="outline-button" type="button" data-cancel>إلغاء</button></div></form>`;
    pending=new Promise(resolve=>{
      let finished=false;const finish=ok=>{if(finished)return;finished=true;dialog.close();dialog.remove();pending=null;opener?.isConnected&&opener.focus();resolve(ok);};
      dialog.querySelectorAll('[data-cancel]').forEach(b=>b.addEventListener('click',()=>finish(false)));
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
      dialog.querySelector('form').addEventListener('submit',async event=>{
        event.preventDefault();const input=dialog.querySelector('input'),button=dialog.querySelector('[type=submit]'),error=dialog.querySelector('[role=alert]');button.disabled=true;
        try{if(await AccessCode.matches(input.value)){input.value='';finish(true);return;}error.textContent='الرمز مو صحيح، جرّب مرة ثانية.';}catch{error.textContent='تعذّر فحص الرمز. حدّث الصفحة وجرّب.';}finally{button.disabled=false;}
        error.hidden=false;input.value='';input.focus();
      });
    });
    document.body.append(dialog);dialog.showModal();refreshIcons();dialog.querySelector('input').focus();return pending;
  }
  async function openReports(){if(reportsUnlocked)return true;if(await request('المعاملات والأرباح')){reportsUnlocked=true;return true;}return false;}
  document.addEventListener('click',async event=>{
    if(event.target.closest('#cloud-logout')){reportsUnlocked=false;return;}
    const target=event.target.closest('a[href="#reports"],[data-unlock-reports]');if(!target)return;
    event.preventDefault();if(await openReports()){if(location.hash!=='#reports')location.hash='reports';else render();}
  });
  function onRoute(id){if(id!=='reports')reportsUnlocked=false;}
  function reports(){return reportsUnlocked?Reports.render():`<section class="card inventory-empty access-locked"><span class="empty-icon">${icon('lock-keyhole')}</span><h2>المعاملات والأرباح مقفلة</h2><p>اكتب رمز الدخول حتى تشوف المعاملات والتقارير.</p><button class="primary-button" data-unlock-reports>فتح المعاملات</button></section>`;}
  return {request,onRoute,reports};
})();
