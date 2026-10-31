const mount=document.getElementById('appHealthMount');
if(mount) {
  const style=document.createElement('style');
  style.textContent='#appHealthMount{margin:6px 0 12px}#appHealthButton{display:flex;align-items:center;gap:8px;min-height:44px;padding:10px 14px;border:1px solid #bbb;border-radius:24px;background:#fff;color:#172033;text-align:left}#appHealthDot{width:12px;height:12px;border-radius:50%;background:#64748b;flex:none}#appHealthPanel{padding:14px;border:1px solid #ddd;border-radius:12px;background:#fff;color:#172033;margin-top:8px;line-height:1.5}#appHealthPanel p{margin:6px 0}';
  document.head.appendChild(style);
  mount.innerHTML='<button id="appHealthButton" type="button" aria-expanded="false" aria-controls="appHealthPanel"><span id="appHealthDot" aria-hidden="true"></span><span data-label>App health: Checking…</span></button><section id="appHealthPanel" aria-label="Android app health" hidden><p data-summary>Checking saved Android data…</p><p data-storage></p><p data-records></p><p data-uploads></p><p data-checked></p></section>';
  const button=mount.querySelector('button'),panel=mount.querySelector('section');
  let busy=false,lastCheck=0;
  const mb=value=>(value/1048576).toFixed(1)+' MB';
  function state(label,color,summary) {
    mount.querySelector('[data-label]').textContent='App health: '+label;
    mount.querySelector('#appHealthDot').style.background=color;
    panel.querySelector('[data-summary]').textContent=summary;
  }
  async function sample(force=false) {
    const native=window.DriverNativeStorage;
    if(!native || busy || document.hidden || (!force && Date.now()-lastCheck<30000))return;
    busy=true;
    try {
      const stats=await native.stats();
      const tasks=await native.tasks();
      const driver=String(native.preferences.getItem('driverId')||'').trim().toUpperCase();
      const pending=tasks.filter(task=>task.status==='LOCAL_COMPLETED' && !task.exported && String(task.driverId||'').trim().toUpperCase()===driver).length;
      if(stats.freeBytes<400*1048576) state('Storage nearly full','#ca8a04','Free up device space and sync completed work.');
      else if(pending) state('Tasks waiting to sync','#ca8a04','Your completed work is saved on this device. Sync when you can.');
      else state('No detected issues','#15803d','Saved task records and photo files passed the storage check.');
      panel.querySelector('[data-storage]').textContent='Saved app data: '+mb(stats.usage)+' · Device space free: '+mb(stats.freeBytes);
      panel.querySelector('[data-records]').textContent='Saved on this device: '+stats.tasks+' tasks · '+stats.photos+' photos';
      panel.querySelector('[data-uploads]').textContent='Your tasks waiting to upload: '+pending;
    } catch(_) {
      state('Storage needs attention','#dc2626','Could not verify saved tasks or photos. Keep the app installed and retry.');
      for(const selector of ['[data-storage]','[data-records]','[data-uploads]']) panel.querySelector(selector).textContent='';
    } finally {
      lastCheck=Date.now();busy=false;
      panel.querySelector('[data-checked]').textContent='Last checked: '+new Date(lastCheck).toLocaleTimeString();
    }
  }
  button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)sample(true);};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sample(true);});
  setInterval(()=>sample(),5000);
  sample();
}
